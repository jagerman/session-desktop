#!/bin/bash

# This script is *not* for general purpose use: it is only for drone CI builds, and relies on
# various things pre-installed in the session builder docker images.

set -e -x

ln -s /session-deps/node_modules .

libsess_base=$(cat /session-deps/package.json | jq -r '.dependencies["libsession_util_nodejs"]')
libsess_curr=$(cat package.json | jq -r '.dependencies["libsession_util_nodejs"]')
echo "LSNJS: ${libsess_base}/${libsess_curr}"

# The yarn install below will wipe this out and reextract it (because it comes from a URL), but also
# doesn't actually rebuild it (because of --ignore-scripts).  This is a nuisance, most of the time,
# because the build in the docker container should be fine.  If it *isn't* then we'll rebuild, but
# if it is we can save the prebuilt image and just move it back into place rather than rebuilding it
# pointlessly.
if [ "${libsess_base}" == "${libsess_curr}" ]; then
    mv node_modules/libsession_util_nodejs node_modules-libsession_util_nodejs-saved
fi

yarn install --frozen-lockfile --ignore-scripts

if [ -d node_modules-libsession_util_nodejs-saved ]; then
    # We saved it, so put it back
    rm -rf node_modules/libsession_util_nodejs
    mv node_modules-libsession_util_nodejs-saved node_modules/libsession_util_nodejs
else
    # We didn't save it, which means we need to rebuild it anyway, so rebuild:
    (cd node_modules/libsession_util_nodejs && yarn install --frozen-lockfile)
fi

yarn patch-package

eb_base=$(cat /session-deps/package.json | jq -r '.devDependencies["electron-builder"]')
eb_curr=$(cat package.json | jq -r '.devDependencies["electron-builder"]')
if [ "${eb_base}" != "${eb_curr}" ]; then
    yarn electron-builder install-app-deps
fi
