#!/bin/zsh

IMAGE="<YOUR-REGISTRY>/app/app-core"
TIMESTAMP=$(date '+%s')
VERSION=$(cat package.json | grep version | sed 's/[ |"|,]//g' | cut -d':' -f 2)
GITLOG=$(git log -1 --format=%h --abbrev=8 | sed 's/\s/''/g')
DIST="${IMAGE}:${VERSION}-${GITLOG}"

echo "Start building docker images: ${DIST}"
if docker build -t "$DIST" .
then
  echo "Build success. Append tag into branch ..."
  if git tag "${VERSION}-${GITLOG}_${TIMESTAMP}"
  then
    echo "Tagged."
  fi
else
  echo "Noooooooooooooopes!"
fi
