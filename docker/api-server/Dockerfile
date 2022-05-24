
FROM node:12

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY * ./
RUN npm install

# If you are building your code for production
# RUN npm ci --only=production
# RUN echo 'hello'

EXPOSE 443
CMD [ "node", "app.js" ]