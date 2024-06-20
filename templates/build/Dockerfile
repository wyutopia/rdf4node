FROM node:20-alpine
# Set aliyun-mirror
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories
# Set Timezone
ENV TZ=Asia/Shanghai
RUN apk add tzdata \
       && cp /usr/share/zoneinfo/${TZ} /etc/localtime \
       && echo "${TZ}" > /etc/timezone
# Install debug tools
RUN apk add curl

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where avaiable (npm@5+)

RUN npm config set registry=https://registry.npmmirror.com
RUN npm config set @icedeer:registry=http://npm.ice-deer.com:30873/
RUN npm install pm2 -g

COPY package.json .
RUN npm install
# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source
COPY . .

# Set default env
ENV PORT=3000

EXPOSE 3000
CMD ["pm2-runtime", "start", "standalone.json"]
