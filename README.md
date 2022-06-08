## Initilaztion
### Setup project manually
#### Create new project with express cli
```
express --view ejs <project-name>
```
#### Copy files inside templates into project folders
* Modify nodejs-example/conf/config.json as you need
#### Replace \<project-root-dir\>/routes/index.js with following code snippet
```
// routes/index.js
const router = require('@icedeer/rdf4node/libs/base/router');
module.exports = router;
```

## Build docker iamge
* Copy Dockerfile, .dockerignore and standalone.json from templates/build into root directory of the host project
* Modify those files according to your project settings
* Copy docker-dist from templates/build into <project-root-dir>/bin/ and modify it as you needed
* Add "docker-dist": "node ./bin/docker-dist" into scripts in <project-root-dir>/package.json

## Start development env.
### Consul
#### Start container
```
docker run -id \
    -p 8300-8302:8300-8302/tcp \
    -p 8500:8500/tcp \
    -p 8301-8302:8301-8302/udp \
    -p 8600:8600/tcp \
    -p 8600:8600/udp \
    --name=consul-dev consul
docker run -id --name=consul-dev -e CONSUL_BIND_INTERFACE=eth0 consul
```
This runs a completely in-memory Consul Server agent with default bridge networking and no services exposed on the host, which is useful for development bu should not be used in production. For example, if that server is running at internal address 172.17.0.2, you can run a three node cluster for development by starting up two more instances and telling them to join the first node.
```
$ docker run -d -e CONSUL_BIND_INTERFACE=eth0 consul agent -dev -join=172.17.0.2 // server 2 starts
$ docker run -d -e CONSUL_BIND_INTERFACE=eth0 consul agent -dev -join=172.17.0.2 // server 3 starts
```
Then we can query for all the members in the cluster by running a Consul CLI command in the first container:
```
$ docker exec -t consul-dev consul members
```

### MongoDB
#### Start container
```
docker pull mongo
docker run -id --name mongo-dev \
    -p 27017:27017 \
    -e MONGO_INITDB_ROOT_USERNAME=admin \
    -e MONGO_INITDB_ROOT_PASSWORD=Dev#2022 \
    mongo --wiredTigerCacheSizeGB 1.5
```
#### Prepare collection
```
mongosh
> use admin
admin> db.auth('admin', 'Dev#2022')
admin> use rdf4
rdf4> db.createUser({ \
    user: 'dbo', \
    pwd: 'Dev#2022' \
    roles: [{role: 'dbOwner', db: 'rdf4}] \
  })
```
### RabbitMQ
#### Start container
```
docker pull rabbitmq:latest
docker run -id --name rmq-dev \
    -p 15672:15672 \
    -p 5672:5672 \
    -p 15692:15692 \
    -e RABBITMQ_DEFAULT_USER=admin \
    -e RABBITMQ_DEFAULT_PASS=Dev#2022 \
    rabbitmq
```
#### Enable management plugin and metrics collector
```
docker exec -it rmq-dev /bin/bash
// In the terminal of container
# rabbitmq-plugins enable rabbitmq_management

# cd /etc/rabbitmq/conf.d
# echo management_agent.disable_metrics_collector = false > management_agent.disable_metrics_collector.conf
# exit

// In the host terminal
docker restart rmq-dev
```

Then you can open web consol from http://127.0.0.1:15672

### Redis
#### Start container
```
docker pull redis:latest
docker run -id -p 6379:6379 \
    --name redis-dev \
    redis --requirepass "Dev#2022"

```
#### Connect with cli
```
docker exec -it redis-dev redis-cli
> auth "Dev#2022"
> select 0         // System allocated database #
```
### Start elasticsearch instance for development
```
docker pull elasticsearch
docker run -id --name es-dev -p 9200:9200 -p 9300:9300 -e "discovery.type=single-node" elasticsearch:7.13.1
```

### MS sql-server 2017 
```
docker pull mcr.microsoft.com/mssql/server:2017-latest
docker run -id \
    -e "ACCEPT_EULA=Y" \
    -e "SA_PASSWORD=Dev#2022" \
    -p 1433:1433 \
    --name sqlsrv-dev \
    mcr.microsoft.com/mssql/server:2017-latest
// Connect to local server
docker exec -it sqlsrv-dev /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P Dev#2022
```

### PostgreSQL
#### Start container
```
docker pull postgres
docker run -id --name pg-dev \
    -e POSTGRES_PASSWORD=Dev#2022 \
    -p 5432:5432 postgres
```
#### The node-postgres client lib
https://www.npmjs.com/package/pg

### Login to registry to publish
```
npm adduser --registry https://nexus.ice-deer.com/repository/npm-release
```

### InfluxDB
```
docker pull influxdb
docker run -id --name influxdb-dev \
    -p 8086:8086 \
    -e DOCKER_INFLUXDB_INIT_USERNAME=admin \
    -e DOCKER_INFLUXDB_INIT_PASSWORD=Dev#2022 \
    influxdb --reporting-disabled
```