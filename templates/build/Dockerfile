FROM node:16-alpine
# Set aliyun-mirror
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories
# Set Timezone
ENV TZ=Asia/Shanghai
RUN apk add tzdata \
       && cp /usr/share/zoneinfo/${TZ} /etc/localtime \
       && echo "${TZ}" > /etc/timezone

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where avaiable (npm@5+)
COPY package*.json ./

RUN npm config set registry https://registry.npm.taobao.org
RUN npm install pm2 -g
RUN npm install
# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source
COPY . .

# Set default env
ENV NODE_ENV=production
ENV SRV_ROLE=rdf4node

EXPOSE 3000
CMD ["pm2-runtime", "start", "standalone.json"]
