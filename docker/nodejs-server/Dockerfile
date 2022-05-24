# Express server
# FROM node:latest AS exp
# RUN mkdir -p /home/node/app
# WORKDIR /home/node/app
# COPY node-image/* ./
# RUN npm install


# FROM debian:latest
FROM mcr.microsoft.com/azure-functions/python:4-python3.9-core-tools

ENV PATH="/usr/local/bin:${PATH}"
RUN apt-get update && apt-get install -y zlib1g-dev libicu-dev g++
RUN apt-get update && apt-get install curl -y
RUN apt-get update && apt-get install wget
RUN apt-get update && apt install sudo
# RUN apt-get update && apt-get install -y openssh-server
# RUN mkdir /var/run/sshd
# RUN echo 'root:okk' | chpasswd
# RUN sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config
# RUN sed 's@session\s*required\s*pam_loginuid.so@session optional pam_loginuid.so@g' -i /etc/pam.d/sshd
# RUN service ssh start
# COPY download-launcher.sh /root/download-launcher.sh
# COPY install-basis.sh install-basis.sh
RUN wget -O- https://aka.ms/install-vscode-server/setup.sh | sh
# RUN /install-basis.sh
# RUN curl -L https://aka.ms/vscode-server-launcher/x86_64-unknown-linux-gnu -o /usr/local/bin/server-launcher
# RUN chmod 777 /usr/local/bin/server-launcher
# RUN server-launcher update || true
# RUN curl -sL https://aka.ms/BasisCliInstall | bash
# RUN basis host -n test -p 5000 --allow-anonymous
# RUN source ~/.zshrc
# RUN curl -L https://aka.ms/vscode-server-launcher/aarch64-unknown-linux-gnu -o /usr/local/bin/server-launcher && chmod +x /usr/local/bin/server-launcher
# RUN curl -L https://aka.ms/vscode-server-launcher/aarch64-unknown-linux-gnu -o server-launcher && chmod +x server-launcher
RUN apt-get update 
RUN curl -s https://deb.nodesource.com/setup_16.x | bash
RUN apt-get install nodejs
RUN mkdir -p /home/node/app
WORKDIR /home/node/app
COPY * ./
RUN npm install


EXPOSE 8000
EXPOSE 8001
EXPOSE 9091
EXPOSE 8080
EXPOSE 443
EXPOSE 80


VOLUME [ "/newfunapp" ]
CMD [ "node", "app.js" ]
# CMD [ "echo", "Great day ahead" ]
# ENTRYPOINT ["tail", "-f", "/dev/null"]
# CMD ["/usr/sbin/sshd", "-D"]
# ENTRYPOINT ["yes", "server-launcher", "serve"]


# ENTRYPOINT ["server-launcher" , "--verbose", "serve", "--tunnel-id", "8s8qnj9h", "--host-token", "eyJhbGciOiJSUzI1NiIsImtpZCI6IjNCQ0REM0ZEQTlGQzY0ODYzMjkxN0E1QjQxQzFERTJCRjIwQTU5NjUiLCJ4NXQiOiJPODNUX2FuOFpJWXlrWHBiUWNIZUtfSUtXV1UiLCJ0eXAiOiJKV1QifQ.eyJjbHVzdGVySWQiOiJ1c2UiLCJ0dW5uZWxJZCI6ImhxY3BscjBiIiwic2NwIjoibWFuYWdlIiwiZXhwIjoxNjUyNDUwNTI0LCJpc3MiOiJodHRwczovL3R1bm5lbHMuYXBpLnZpc3VhbHN0dWRpby5jb20vIiwiYXVkIjoiaHR0cHM6Ly90dW5uZWxzLmFwaS52aXN1YWxzdHVkaW8uY29tLyIsImp0aSI6IjcyNzc2M2UzLTczODUtNDk5Mi04OTM1LTllOTUzYWQ0NmMyMyIsImlhdCI6MTY1MjM2NDEyNCwibmJmIjoxNjUyMzYzMjI0fQ.YFWwtE4-OFD1s4ehRA_vvanNhMlC2ynSclrf-GIaX5JHOD9ukL1qrbIaXK2ZdR1ghpNGnEpKWyKJP-0upvewmhCZumO8iQJpf-KxCC4XVbAfx3fIy6V0eHvWwtG20s_5GoO6EWYEH2OShnHGh7rOsLUj_fqbwhKfE80q-RDBJQtj13JwKg_zbmUri3-ovLif3DgruMsdORepHE0iWJj5NFC6oJH00SUXExTDiLzrOzDRM02V_7uoVB2PGKIMH3VQ3aCtFvFdwwHWWE0gzk_Gr7Yr2HIn16cr2pSAK-cR0PqWIYU7AsRHdbgETl4uW_cUWNrJ-TdnWc5uig9_ytTTmw"]
# ENTRYPOINT ["server-launcher" , "--verbose", "serve"]