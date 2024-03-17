#!/usr/bin/env bash

# Script used with Drone CI to upload build artifacts (because specifying all this in
# .drone.jsonnet is too painful).



set -o errexit

if [ -z "$SSH_KEY" ]; then
    echo -e "\n\n\n\e[31;1mUnable to upload artifact: SSH_KEY not set\e[0m"
    # Just warn but don't fail, so that this doesn't trigger a build failure for untrusted builds
    exit 0
fi

echo "$SSH_KEY" >ssh_key

set -o xtrace  # Don't start tracing until *after* we write the ssh key

chmod 600 ssh_key

# We'll upload this to:
# - oxen-io/session-desktop/v1.2.3 (for a tag build)
# - oxen-io/session-desktop/BRANCHNAME-123abc891 (otherwise)
upload_to="oxen.rocks/${DRONE_REPO// /_}/${DRONE_TAG:-${DRONE_BRANCH:-unknown}-${DRONE_COMMIT:0:9}}"


# FIXME: conflict between amd64/arm64 builds latest.yml?

files=(release/session-desktop-* release/latest*.yml)
final_names=()

puts=""
for f in "${files[@]}"; do
    if [[ $f =~ (.*)\.((exe|rpm|deb|AppImage|zip|dmg|yml|freebsd).*) ]]; then
        # If this is *not* a tagged build then rename all the release files to append the commit
        # hash
        if [ -z "$DRONE_TAG" ]; then
            newname="${BASH_REMATCH[1]}-${DRONE_COMMIT:0:9}.${BASH_REMATCH[2]}"
            mv "$f" "$newname"
            f="$newname"
        fi
        final_names+=("$f")
        puts="$puts
put $f $upload_to"
    else
        echo "Unknown file encountered, don't know what to do with it: $f" >&2
        exit 1
    fi
done

# sftp doesn't have any equivalent to mkdir -p, so we have to split the above up into a chain of
# -mkdir a/, -mkdir a/b/, -mkdir a/b/c/, ... commands.  The leading `-` allows the command to fail
# without error.
upload_dirs=(${upload_to//\// })
mkdirs=
dir_tmp=""
for p in "${upload_dirs[@]}"; do
    dir_tmp="$dir_tmp$p/"
    mkdirs="$mkdirs
-mkdir $dir_tmp"
done

sftp -i ssh_key -b - -o StrictHostKeyChecking=off drone@oxen.rocks <<SFTP
$mkdirs
$puts
SFTP

set +o xtrace

sha256sum "${final_names[@]}"

echo -e "\n\n\n\n\e[32;1mUploaded to https://${upload_to}\e[0m\n\n\n"

