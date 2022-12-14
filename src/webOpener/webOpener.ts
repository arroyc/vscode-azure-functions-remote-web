import { TunnelRelayTunnelHost } from "@vs/tunnels-connections";
import {
  Tunnel,
  TunnelAccessControl,
  TunnelAccessControlEntry,
  TunnelAccessControlEntryType,
  TunnelServiceProperties,
} from "@vs/tunnels-contracts";
import {
  TunnelManagementHttpClient,
  TunnelRequestOptions,
} from "@vs/tunnels-management";
import axios from "axios";
import {
  BasisClient,
  BasisWebSocketFactory,
  ConnectionManager,
  getMatchingSessionForTunnelName,
  IAuthenticationSession,
  IMatchedTunnel,
  LoopbackHandler,
} from "@vscode-internal/remote-web-tunnels";
import {
  AuthenticationSession,
  IMicrosoftAuthentication,
  IRouteResult,
} from "../common/types";
import { IProductInfo } from "./types";
import {
  IProgress,
  IProgressCompositeOptions,
  IProgressDialogOptions,
  IProgressNotificationOptions,
  IProgressOptions,
  IProgressStep,
  IProgressWindowOptions,
  IWebSocket,
  IWebSocketFactory,
  LogLevel,
  URI,
} from "vs/workbench/workbench.web.main";
import { Basis } from "../common/basis";
import { showProgress } from "./util/progress";
// import * as vscode from 'vscode';
import { activate } from "../extension";
import pRetry from "p-retry";

export const BASIS_SCOPES = [
  `${TunnelServiceProperties.production.serviceAppId}/.default`,
];
export const MANAGEMENT_SCOPES = [`https://management.azure.com/.default`];

const tunnelPort = 31545;
const urlParamMap = new Map<string, number>([
  ["subscription", 0],
  ["resourceGroup", 1],
  ["functionAppName", 2],
  ["username", 3],
]);

const cachedWorkerHostname = "workerHostname";
const cachedTunnelDefinition = "tunnel-def";

const containerServiceHostname =
  // "https://limelight-api-server.salmonfield-d8375633.centralus.azurecontainerapps.io:443";
  "https://limelight-container-service.mangostone-a0af9f1f.centralus.azurecontainerapps.io:443";
// "http://localhost:443";
const USER_AGENT = "vscode.dev.azure-functions-remote-web";
const AzureAuthManager = require("./azureAuthUtility.js");

export interface IRouterWorkbench {
  commands: {
    executeCommand(command: string, ...args: any[]): Promise<unknown>;
  };
  logger: {
    log(level: LogLevel, message: string): Promise<void>;
  };
  window: {
    withProgress<R>(
      options:
        | IProgressOptions
        | IProgressDialogOptions
        | IProgressNotificationOptions
        | IProgressWindowOptions
        | IProgressCompositeOptions,
      task: (progress: IProgress<IProgressStep>) => Promise<R>
    ): Promise<R>;
  };
}

export default async function doRoute(
  route: IRouteResult,
  extra: {
    version: IProductInfo;
    microsoftAuthentication: IMicrosoftAuthentication;
    workbench: IRouterWorkbench;
    registerLoopbackResponder: (fn: LoopbackHandler) => void;
  }
) {
  console.log("Starting vscode-remote-azure-function extension..");

  axios.defaults.headers.post["Content-Security-Policy-Report-Only"] =
    "default-src 'self'";

  let workspaceOrFolderUri =
    "folderUri" in route.workspace!
      ? route.workspace.folderUri
      : route.workspace!.workspaceUri;

  console.log("uri: " + workspaceOrFolderUri);
  const version = parseVersion(workspaceOrFolderUri.query);

  console.log(`Getting authority name ${workspaceOrFolderUri.authority}`);
  const loadUri = workspaceOrFolderUri.with({
    // scheme: 'http',
    authority: `appazurefunctions+${workspaceOrFolderUri.authority}`,
    // authority: `appazurefunctions+test`,
    // path: '/root/.npm'
  });

  console.log("Before getting AAD tokens");

  // Get aad tokens
  const azureAuthManager = new AzureAuthManager(extra.microsoftAuthentication);
  const managementAccessToken = await azureAuthManager.getAccessToken(
    MANAGEMENT_SCOPES
  );
  const basisAccessToken = await azureAuthManager.getAccessToken(BASIS_SCOPES);

  console.log("after getting AAD tokens");

  // Parse function app details from url
  const { subscription, resourceGroup, functionAppName, username } =
    parseFunctionAppDetails(workspaceOrFolderUri);

  const isNewApp = await isFunctionAppNew(
    subscription,
    resourceGroup,
    functionAppName,
    managementAccessToken
  );

  console.log(`functionapp name ${functionAppName}`);
  console.log(`${functionAppName} is a ${isNewApp ? "new" : "existing"} app`);
  // Only get connection string if function app already exists
  let storageAccountConnectionString,
    storageAccountName,
    storageAccountKey,
    srcURL;

  storageAccountConnectionString =
    await getFunctionAppStorageAccountConnectionString(
      subscription,
      resourceGroup,
      functionAppName,
      managementAccessToken
    );
  [storageAccountName, storageAccountKey] = parseStorageAccountDetails(
    storageAccountConnectionString
  );

  if (!isNewApp) {
    srcURL = await getFunctionAppSrcURL(
      subscription,
      resourceGroup,
      functionAppName,
      managementAccessToken
    );
  }

  let tunnel;
  const rawTunnelDef = localStorage.getItem(cachedTunnelDefinition);

  const cachedTunnelDef = rawTunnelDef ? JSON.parse(rawTunnelDef) : undefined;
  if (cachedTunnelDef) {
    try {
      tunnel = await Basis.findTunnel(basisAccessToken, cachedTunnelDef);
    } catch (e) {
      console.log(e);
      // TODO: send toast err msg to user
    }
  }

  if (!tunnel) {
    // delete
    localStorage.removeItem(cachedTunnelDefinition);

    await pRetry(
      async () => {
        tunnel = await Basis.createTunnelWithPort(
          basisAccessToken,
          `${functionAppName.toLowerCase()}-${username.toLowerCase()}-${new Date().getMilliseconds()}`,
          tunnelPort
        );
        localStorage.setItem(cachedTunnelDefinition, JSON.stringify(tunnel));
      },
      {
        onFailedAttempt: async (error) => {
          console.log(
            `Deleting inactive tunnels as max tunnel count limit for user reached`
          );
          console.error(error);
          return await Basis.deleteInactiveTunnels(basisAccessToken);
        },
        retries: 3,
      }
    );
  }

  // Call container api hosted at the container app ip
  console.log("Tunnel is found..");
  console.log(tunnel);
  const tunnelActive = await Basis.isActive(basisAccessToken, tunnel);
  let workerHostname: string | null =
    localStorage.getItem(cachedWorkerHostname);
  if (!tunnelActive) {
    // If not, call api server to create and return a new container app
    localStorage.removeItem(cachedWorkerHostname);
    workerHostname = await createLimelightSession(
      storageAccountName,
      storageAccountKey,
      version,
      functionAppName
    );

    if (!workerHostname) {
      throw new Error("Hostname is empty");
    }

    await syncFile(
      username,
      workerHostname,
      functionAppName,
      storageAccountConnectionString,
      storageAccountKey,
      srcURL,
      version,
      isNewApp
    );

    await startCodeServer(workerHostname, tunnel);
  } else {
    if (!workerHostname) {
      throw new Error("Hostname is empty");
    }

    await syncFile(
      username,
      workerHostname,
      functionAppName,
      storageAccountConnectionString,
      storageAccountKey,
      srcURL,
      version,
      isNewApp
    );
  }

  let match: IMatchedTunnel;
  try {
    const m = await getMatchingSessionForTunnelName({
      userAgent: USER_AGENT,
      sessions: await getMicrosoftAuthSessions(extra.microsoftAuthentication),
      name: tunnel.name,
    });

    if (!m) {
      await extra.microsoftAuthentication.getSessions(
        BasisClient.BASIS_SCOPES,
        {
          forceNewSession: false,
        }
      );
      return await new Promise(() => {});
    }
    match = m;
  } catch (e) {
    route.workbenchOptions = {
      ...route.workbenchOptions,
      remoteAuthority: loadUri.authority,
      webSocketFactory: new FailingWebSocketFactory(e as Error),
    };
    return;
  }

  const manager = new ConnectionManager({
    tunnel: match.tunnel,
    port: tunnel.remotePort,
    productInfo: extra.version,
    basis: match.client,
    installExtensionsOnRemote: [
      "ms-azuretools.vscode-azurefunctions",
      "humao.rest-client",
      "ms-python.python",
    ],
  });

  extra.registerLoopbackResponder(manager.loopbackHandler);

  manager.onStartConnecting(() => {
    manager.onLog((log) => {
      extra.workbench!.logger.log(log.level, log.line);
    });
    showProgress(extra.workbench!, manager, "hello");
  });

  route.workbenchOptions = {
    ...route.workbenchOptions,
    webSocketFactory: new BasisWebSocketFactory(manager),
    resourceUriProvider: (uri: URI): URI =>
      uri.with({
        scheme: window.location.protocol.slice(0, -1),
        authority: window.location.host,
        path: `/loopback`,
        query: new URLSearchParams({ uri: uri.toString() }).toString(),
      }),
    productConfiguration: {
      extensionAllowedProposedApi: [
        "ms-azuretools.vscode-azure-functions-remote-web",
      ],
      extensionEnabledApiProposals: {
        "ms-azuretools.vscode-azure-functions-remote-web": ["resolvers"],
      },
    },
    windowIndicator: {
      label: `Remote Azure Function CI: "hello"`,
      tooltip: `Remote Azure Function CI: "hello"`,
      onDidChange: () => ({ dispose: () => undefined }),
    },
    remoteAuthority: loadUri.authority,
  };

  if (isNewApp) {
    route!.onDidCreateWorkbench!.runCommands = [
      {
        command: "azureFunctions.createNewProject",
        args: [],
      },
    ];
  }

  route.workspace = { folderUri: loadUri };
}

class FailingWebSocketFactory implements IWebSocketFactory {
  constructor(private readonly error: Error) {}

  create(url: string): IWebSocket {
    return {
      close: () => {},
      onClose: () => ({ dispose: () => {} }),
      onData: () => ({ dispose: () => {} }),
      onError: (e) => {
        setTimeout(() => e(this.error), 1);
        return { dispose: () => {} };
      },
      onOpen: () => ({ dispose: () => {} }),
      send: () => {},
    };
  }
}

async function startCodeServer(workerHostname: string, tunnel: any) {
  try {
    console.log(`Starting code server at ${workerHostname}..`);
    const { data } = await axios.post(
      `https://${workerHostname}:443/limelight-worker/code-server/start`,
      {
        tunnelId: tunnel.name,
        hostToken: tunnel.token,
        tunnelName: tunnel.name,
        cluster: tunnel.clusterId,
      }
    );
    console.log(`Started code server in limelight: ${data}`);
    setInterval(async () => {
      // const status = await axios.get('http://localhost:443/ping');
      const status = await axios.get(
        `https://${workerHostname}:443/limelight-worker/pat`
      );
      console.log(status);
      localStorage.removeItem(cachedWorkerHostname);
      //TODO: if failed, container app is gone, create new container app with same name
    }, 5000);
  } catch (error) {
    console.log(`Failed to start code server: ${error}`);
    //TODO: if failed, container app is gone, create new container app with same name
    localStorage.removeItem(cachedWorkerHostname);
  }
}

async function createLimelightSession(
  storageAccountName: string,
  storageAccountKey: string,
  version: string,
  functionAppName: string
) {
  let workerHostname;
  try {
    console.log("Starting limelight session..");
    const containerInfo = await axios.post(
      // `${containerServiceHostname}/limelight/session/start`,
      `${containerServiceHostname}/limelight/session/start`,
      {
        // TODO: pass in custom container app name, if not exist, create one with the name otherwise return the info
        calledWhen: new Date().toISOString(),
        storageName: storageAccountName,
        accountKey: storageAccountKey,
        version,
        functionAppName,
      }
    );
    console.log("Limelight session is created..");
    console.log(containerInfo);
    workerHostname = containerInfo.data.data.configuration.ingress.fqdn;
    if (workerHostname) {
      localStorage.setItem(cachedWorkerHostname, workerHostname);
    }
  } catch (error) {
    console.log("Failed to create limelight session..");
    console.log(error);
    throw new Error("Failed to create limelight session..");
  }
  return workerHostname;
}

async function syncFile(
  username: string,
  workerHostname: string,
  functionAppName: string,
  storageAccountConnectionString: any,
  storageAccountKey: string,
  srcURL: any,
  version: string,
  isNewApp: boolean
) {
  try {
    console.log(
      `Starting syncing cx function app files at ${workerHostname}..`
    );
    const res = await axios.post(
      `${containerServiceHostname}/limelight/file/sync`,
      {
        username,
        hostname: workerHostname,
        functionAppName,
        connStr: storageAccountConnectionString,
        accountKey: storageAccountKey,
        srcURL,
        version,
        isNewApp,
      }
    );
    console.log(`Cx function app files are synced: ${res}`);
  } catch (e) {
    console.log(`Failed to sync cx function app files`);
    throw e;
  }
}

function parseVersion(version: string) {
  const versionParts = version.split("=");
  if (!versionParts || versionParts.length < 2) {
    throw new Error(`please specify the code version correctly!`);
  }
  return versionParts[1];
}
function parseStorageAccountDetails(storageAccountConnectionString: string) {
  if (!storageAccountConnectionString) {
    throw new Error(`Storage account connection string is undefined!`);
  }
  const connectionStringParts = storageAccountConnectionString.split(";");
  const accountNameParts = connectionStringParts[1].split("=");
  const accountKeyParts = connectionStringParts[2].substring(
    connectionStringParts[2].indexOf("=") + 1
  );

  return [accountNameParts[1], accountKeyParts];
}

function parseFunctionAppDetails(workspaceOrFolderUri: URI) {
  if (
    !workspaceOrFolderUri.authority ||
    workspaceOrFolderUri.authority.length < urlParamMap.size
  ) {
    throw new Error("Please enter a valid url!");
  }
  const resourceParts = workspaceOrFolderUri.authority.split("+");

  const subscription = resourceParts[urlParamMap.get("subscription") || 0];
  const resourceGroup = resourceParts[urlParamMap.get("resourceGroup") || 1];
  const functionAppName =
    resourceParts[urlParamMap.get("functionAppName") || 2];
  const username = resourceParts[urlParamMap.get("username") || 3];

  [subscription, resourceGroup, functionAppName, username].forEach((param) => {
    if (!param) {
      const [paramName] = Object.keys({ param });
      throw new Error(`${paramName} can not be null in the url!`);
    }
  });

  return { subscription, resourceGroup, functionAppName, username };
}

async function getFunctionAppStorageAccountConnectionString(
  subscription: string,
  resourceGroup: string,
  functionAppName: string,
  managementAccessToken: any
) {
  // SUBSCRIPTION SHOULD BE SUBSCRIPTION ID
  const url = `https://management.azure.com/subscriptions/${subscription}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/sites/${functionAppName}/config/appsettings/list?api-version=2021-02-01`;
  console.log(`Retrieving function app storage account connection string...`);
  const { data } = await axios.post(url, "", {
    headers: {
      Authorization: "Bearer " + managementAccessToken,
    },
  });
  const connStr = data["properties"]["AzureWebJobsStorage"];
  console.log(`Function app storage account connection string retrieved.`);
  return connStr;
}

async function getFunctionAppSrcURL(
  subscription: string,
  resourceGroup: string,
  functionAppName: string,
  managementAccessToken: any
) {
  // SUBSCRIPTION SHOULD BE SUBSCRIPTION ID
  const url = `https://management.azure.com/subscriptions/${subscription}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/sites/${functionAppName}/config/appsettings/list?api-version=2021-02-01`;
  console.log(`Retrieving function app src url...`);
  const { data } = await axios.post(url, "", {
    headers: {
      Authorization: "Bearer " + managementAccessToken,
    },
  });
  let srcURL;
  // WRFP setting does not exist or is 0
  if (
    data["properties"]["WEBSITE_RUN_FROM_PACKAGE"] === undefined ||
    data["properties"]["WEBSITE_RUN_FROM_PACKAGE"] === 0
  ) {
    const scmURL = `https://${functionAppName}.scm.azurewebsites.net/api/settings`;
    const { data } = await axios.get(scmURL, {
      headers: {
        Authorization: "Bearer " + managementAccessToken,
      },
    });
    srcURL = data["SCM_RUN_FROM_PACKAGE"];
    // WRFP setting is 1
  } else if (data["properties"]["WEBSITE_RUN_FROM_PACKAGE"] === 1) {
    srcURL = data["properties"]["WEBSITE_CONTENTSHARE"];
  } else {
    srcURL = data["properties"]["WEBSITE_RUN_FROM_PACKAGE"];
  }
  // WRFP setting is URL
  console.log(`Function app source URL retrieved. ` + srcURL);
  return srcURL;
}

async function getMicrosoftAuthSessions(
  microsoftAuthentication: IMicrosoftAuthentication
): Promise<IAuthenticationSession[]> {
  const auth = await microsoftAuthentication.getSessions(
    BasisClient.BASIS_SCOPES
  );
  return auth.map((s) => {
    return {
      id: s.id,
      getAccessToken: s.getAccessToken,
      provider: "microsoft",
    };
  });
}

async function isFunctionAppNew(
  subscription: string,
  resourceGroup: string,
  functionAppName: string,
  managementAccessToken: string
) {
  console.log(`Determining if ${functionAppName} is new`);
  const url = `https://management.azure.com/subscriptions/${subscription}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/sites/${functionAppName}/functions?api-version=2022-03-01`;

  // checking to see if func app exists
  try {
    const { data } = await axios.get(url, {
      headers: {
        Authorization: "Bearer " + managementAccessToken,
      },
    });
    console.log(data);

    return data.value.length === 0;

    // error means no such app exists in storage
  } catch (error) {
    // console.log("new func app");
    console.log(error);
    throw error;
  }
}
