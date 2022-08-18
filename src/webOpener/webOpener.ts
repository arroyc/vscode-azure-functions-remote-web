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
  getMatchingSessionForTunnel,
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
import { url } from "inspector";
// import * as vscode from 'vscode';
import { ContainerAppsAPIClient } from "@azure/arm-app";
import { DefaultAzureCredential } from "@azure/identity";
import { v4 as uuidv4 } from "uuid";
import { activate } from "../extension";
import { error } from "console";
import pRetry, { AbortError } from "p-retry";

export const BASIS_SCOPES = [
  `${TunnelServiceProperties.production.serviceAppId}/.default`,
];
const USER_AGENT = "vscode.dev.azure-functions-remote-web";
const AzureAuthManager = require("./azureAuthUtility.js");
var new_func_app = false;

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

  //   axios.defaults.headers.get["Origin"] = "https://developer.mozilla.org";
  axios.defaults.headers.post["Content-Security-Policy-Report-Only"] =
    "default-src 'self'";

  let tunnel;
  let workspaceOrFolderUri =
    "folderUri" in route.workspace!
      ? route.workspace.folderUri
      : route.workspace!.workspaceUri;
  console.log("uri: " + workspaceOrFolderUri);
  const loadUri = workspaceOrFolderUri.with({
    // scheme: 'http',
    authority: `appazurefunctions+${workspaceOrFolderUri.authority}`,
    // authority: `appazurefunctions+test`,
    // path: '/root/.npm'
  });
  // Get aad token
  var azureAuthManager = new AzureAuthManager(extra.microsoftAuthentication);
  const session = await azureAuthManager.getAzureAuthSession(BASIS_SCOPES);
  console.log("Getting AAD session...");
  console.log(session);
  const accessToken = session.accessToken;

  const azure_session = await azureAuthManager.getAzureAuthSession([
    "https://management.azure.com/.default",
  ]);

  console.log("Getting AAD token...");
  const azure_accessToken = azure_session.accessToken;
  console.log(azure_accessToken);
  // const test_session = await authenticate(['722270b8-de35-4e83-84b8-ce1ab56327cc/.default'])
  // const test_accToken = test_session.accessToken;
  // console.log(`test token: ${test_accToken}`);

  console.log("Checking if its a new or existing app..");
  var url =
    "https://management.azure.com//subscriptions/e323ee1a-020a-4faa-8df9-23dbc171a8d2/resourceGroups/t-tomabraham-rg/providers/Microsoft.Web/sites/new-app-to?api-version=2021-02-01";

  // checking to see if func app exists
  try {
    var { data } = await axios.get(url, {
      headers: {
        Authorization: "Bearer " + azure_accessToken,
      },
    });
    console.log(data);
    new_func_app = false;

    // error means no such app exists in storage
  } catch (error) {
    // console.log("new func app");
    new_func_app = true;
  }

  // only get connection string if func app exists (meaning it is NOT a new_func_app)
  if (new_func_app === false) {
    var url =
      "https://management.azure.com/subscriptions/e323ee1a-020a-4faa-8df9-23dbc171a8d2/resourceGroups/t-tomabraham-rg/providers/Microsoft.Web/sites/new-app-tom/config/appsettings/list?api-version=2021-02-01";
    var { data } = await axios.post(url, "", {
      headers: {
        Authorization: "Bearer " + azure_accessToken,
      },
    });
    const conn_str = data["properties"]["AzureWebJobsStorage"];
    console.log("Connection String: " + conn_str);
  }

  // console.log("access token: " + accessToken);

  const rawTunnelDef = localStorage.getItem("tunnel-def");

  const cachedTunnelDef = rawTunnelDef ? JSON.parse(rawTunnelDef) : undefined;
  if (cachedTunnelDef) {
    try {
      tunnel = await Basis.findTunnel(accessToken, cachedTunnelDef);
    } catch (e) {
      console.log(e);
      // TODO: send toast err msg to user
    }
  }

  if (!tunnel) {
    // delete
    localStorage.removeItem("tunnel-def");

    await pRetry(
      async () => {
        tunnel = await Basis.createTunnelWithPort(accessToken, 8000);
        localStorage.setItem("tunnel-def", JSON.stringify(tunnel));
      },
      {
        onFailedAttempt: async (error) => {
          console.log(
            `Deleting inactive tunnels as max tunnel count limit for user reached`
          );
          return await Basis.deleteInactiveTunnels(accessToken);
        },
        retries: 3,
      }
    );

    // try {
    //   tunnel = await Basis.createTunnelWithPort(accessToken, 8000);
    //   localStorage.setItem("tunnel-def", JSON.stringify(tunnel));
    // } catch (e) {
    //   console.log(e);
    //   // TODO: send toast err msg to user, find inactive tunnels and prompt user whether to delete
    //   await Basis.deleteInactiveTunnels(accessToken);
    // }
  }

  // Look up container info in cache

  // Call container api hosted at the container app ip
  console.log(tunnel);
  // if tunnel exists,
  //    if active, conn
  //    if not, kill it, create new update localstorage
  // if tunnel not exists, create new update localstorage
  const tunnelActive = await Basis.isActive(accessToken, tunnel);
  if (!tunnelActive) {
    // If not, call api server to create and return a new container app
    localStorage.removeItem("hostname");
    let hostname = "";
    try {
      console.log("extension call session/start");
      const containerInfo = await axios.post(
        "https://limelight-api-server.salmonfield-d8375633.centralus.azurecontainerapps.io:443/limelight/session/start",
        {
          // TODO: pass in custom container app name, if not exist, create one with the name otherwise return the info
          calledWhen: new Date().toISOString(),
        }
      );
      console.log(containerInfo);
      hostname = containerInfo.data.data.configuration.ingress.fqdn;
      if (hostname !== "") {
        localStorage.setItem("hostname", hostname);
      } else {
        throw new Error("Hostname is empty");
      }
    } catch (error) {
      console.log(error);
      throw new Error("Failed to initialize limelight!");
    }

    try {
      // const { data } = await axios.post('http://vscoderemote.centralus.azurecontainer.io:80/utility', {
      // const { data } = await axios.post('https://20.221.97.147:443/utility', {
      // const { data } = await axios.post('https://project-limelight-p0.salmonfield-d8375633.centralus.azurecontainerapps.io:443/utility', {
      // const { data } = await axios.post('http://localhost:443/utility', {
      const { data } = await axios.post(
        `https://${hostname}:443/limelight/code-server/start`,
        {
          tunnelId: tunnel.tunnelId,
          hostToken: tunnel.token,
          tunnelName: tunnel.name,
          cluster: tunnel.clusterId,
        },
        {
          timeout: 8000,
        }
      );
      console.log("Started code server in limelight: " + data);
      setInterval(async () => {
        // const status = await axios.get('http://localhost:443/ping');
        const status = await axios.get(`https://${hostname}:443/limelight/pat`);
        console.log(status);
        localStorage.removeItem("hostname");
        //TODO: if failed, container app is gone, create new container app with same name
      }, 5000);
    } catch (error) {
      console.log(error);
      //TODO: if failed, container app is gone, create new container app with same name
      localStorage.removeItem("hostname");
    }
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
      extensionAllowedProposedApi: ["ms-toolsai.vscode-ai-remote-web"],
      extensionEnabledApiProposals: {
        "ms-toolsai.vscode-ai-remote-web": ["resolvers"],
      },
    },
    windowIndicator: {
      label: `Remote Azure Function CI: "hello"`,
      tooltip: `Remote Azure Function CI: "hello"`,
      onDidChange: () => ({ dispose: () => undefined }),
    },
    remoteAuthority: loadUri.authority,
  };

  route!.onDidCreateWorkbench!.runCommands = [
    {
      command: "mypanel.start",
      args: [new_func_app],
    },
  ];
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
