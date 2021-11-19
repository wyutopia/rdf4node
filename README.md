## Initilaztion
### Setup project manually
* Copy all folders inside templates into <project-root-dir>
* Modify <project-root-dir>/conf/config.json as you need
* 

### You can also using cli to initilze a new project


## Build docker iamge
* Copy Dockerfile, .dockerignore and standalone.json from templates/build into root directory of the host project
* Modify those files according to your project settings
* Copy docker-dist from templates/build into <project-root-dir>/bin/ and modify it as you needed
* Add "docker-dist": "node ./bin/docker-dist" into scripts in <project-root-dir>/package.json