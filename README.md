## Create project
### New project with express
```
sudo npm -g install express-generator
express --view=ejs demo
```
### Install rdf4node lib and run init script
```
cd demo
npm install
npm install @icedeer/rdf4node --save
./node_modules/@icedeer/rdf4node/rdfinit
```
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
#### Start dev container with local data store
```
docker pull mongo
docker run -id --name mongo-dev \
    -p 27017:27017 \
    -e MONGO_INITDB_ROOT_USERNAME=admin \
    -e MONGO_INITDB_ROOT_PASSWORD=Dev#2022 \
    -v /Users/$(whoami)/.repos/mongodb:/data/db \
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
#### Dump and restore all databases
```
mongodump --host=<HOST_IP> --port=<HOST_PORT>  \
          --authenticationDatabase=<AUTH_SOURCE> -u admin -p Dev#2022 \
          --out=<BACKUP_DIR>
mongorestore --host=<> --port=<> \
             --authenticationDatabase=<AUTH_SOURCE> -u admin -p Dev#2022 \
             --nsInclude=<DATABASE>.<COLLECTION> <BACKUP_DIR> --drop
```
#### Download MongoDB Shell and MongoDB Database Tools
* https://www.mongodb.com/try/download/database-tools2
* https://www.mongodb.com/try/download/shell2

### RabbitMQ
#### Start container
```
docker pull rabbitmq:latest
docker run -id --name rmq-dev \
    -p 15672:15672 \
    -p 5672:5672 \
    -p 15692:15692 \
    -e RABBITMQ_DEFAULT_VHOST=dev \
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
    redis --requirepass "Dev#2023"

```
#### Connect with cli
```
docker exec -it redis-dev redis-cli
> auth "Dev#2023"
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

### ClickHouse
#### From Docker Image
```
docker pull clickhouse/clickhouse-server
docker run -id --name clickhouse-dev \
    -p 8123:8123 \
    -p 9000:9000 \
    --ulimit nofile=262144:262144 \
    clickhouse/clickhouse-server
```
#### From RPM Packages
```
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://packages.clickhouse.com/rpm/clickhouse.repo
sudo yum install -y clickhouse-server clickhouse-client

sudo /etc/init.d/clickhouse-server start
clickhouse-client # or "clickhouse-client --password" if you set up a password.
```
### elasticsearch
#### Pull the Elasticsearch Docker image
```
docker pull docker.elastic.co/elasticsearch/elasticsearch:8.5.0
```
#### Start a single-node cluster with Docker
1.Create a new docker network for Elasticsearch and Kibana
```
docker network create elastic
```
2.Start Elasticsearch in Docker.
https://www.elastic.co/guide/en/elasticsearch/reference/current/docker.html?baymax=rec&rogue=pop-1&elektra=guide
```
docker run -id --name es-dev \
    --net elastic \
    -p 9200:9200 \
    -p 9300:9300 \
    -e "discovery.type=single-node" \
    docker.elastic.co/elasticsearch/elasticsearch:8.5.0
```
3.Copy the generated password and enrollment token and save them in a secure location.
<br>If you need to reset the password for the elastic user or other built-in users, run the 
elasticsearch-reset-password tool.
```
docker exec -it es-dev /usr/share/elasticsearch/bin/elasticsearch-reset-password -u elastic
```
4.Copy the http-ca.crt security certificate from your Docker container to your local machine.
```
docker cp es-dev:/usr/share/elasticsearch/config/certs/http_ca.crt .
```
5.Open a new terminal and verify that you can connect to your Elasticsearch cluster by making
an authenticated call, using the http_ca.crt file that you copied from your Docker container.
Enter the password for the elastic user when prompted.
```
curl --cacert http_ca.crt -u elastic https://localhost:9200
--- Following is the output infomration ---
Enter host password for user 'elastic':
{
  "name" : "ae0c86d11961",
  "cluster_name" : "docker-cluster",
  "cluster_uuid" : "ttgKPshrTqOMRnu4d_zr9w",
  "version" : {
    "number" : "8.5.0",
    "build_flavor" : "default",
    "build_type" : "docker",
    "build_hash" : "c94b4700cda13820dad5aa74fae6db185ca5c304",
    "build_date" : "2022-10-24T16:54:16.433628434Z",
    "build_snapshot" : false,
    "lucene_version" : "9.4.1",
    "minimum_wire_compatibility_version" : "7.17.0",
    "minimum_index_compatibility_version" : "7.0.0"
  },
  "tagline" : "You Know, for Search"
}
```
