## Initilaztion
### Setup project manually
* Create new express project with command: express --view ejs <project-name>
* Copy all folders inside templates into <project-root-dir>
* Modify <project-root-dir>/conf/config.json as you need
* 

### You can also using cli to initilze a new project


## Build docker iamge
* Copy Dockerfile, .dockerignore and standalone.json from templates/build into root directory of the host project
* Modify those files according to your project settings
* Copy docker-dist from templates/build into <project-root-dir>/bin/ and modify it as you needed
* Add "docker-dist": "node ./bin/docker-dist" into scripts in <project-root-dir>/package.json

## Start development env.
### Consul
#### Start container
```
docker pull consul
docker run -id --name consul-dev \
    -p 8300-8302:8300-8302/tcp \
    -p 8500:8500/tcp \
    -p 8301-8302:8301-8302/udp \
    -p 8600:8600/tcp \
    -p 8600:8600/udp \
    -e CONSUL_BIND_INTERFACE=eth0 \
    consul
```
### MongoDB
#### Start container
```
docker pull mongo
docker run -id --name mongo-dev \
    -p 27017:27017 \
    -e MONGO_INITDB_ROOT_USERNAME=admin \
    -e MONGO_INITDB_ROOT_PASSWORD=Dev#2021 \
    mongo --wiredTigerCacheSizeGB 1.5
```
#### Prepare collection
```
mongosh
> use admin
admin> db.auth('admin', 'Dev#2021')
admin> use rdf4
rdf4> db.createUser({ \
    user: 'dbo', \
    pwd: 'Dev#2021' \
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
    -e RABBITMQ_DEFAULT_PASS="Dev#2021" \
    rabbitmq
```
#### Enable management plugin
```
docker exec -it rmq-dev /bin/bash
// In the terminal of container
# rabbitmq-plugins enable rabbitmq_management
```
Then you can open web consol from http://127.0.0.1:15672

### Redis
#### Start container
```
docker pull redis:latest
docker run -id --name redis-dev \
    -p 6379:6379 \
    redis --requirepass "Dev#2021"
```
#### Connect with cli
```
docker exec -it redis-dev redis-cli
> auth "Dev#2021"
> select 0         // System allocated database #
```