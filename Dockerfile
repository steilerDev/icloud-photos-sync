FROM python:3.8-bullseye

# Applying fs patch for assets
ADD rootfs.tar.gz /

RUN apt-get update \
 && apt-get install \
        --no-install-recommends \
        --fix-missing \
        --assume-yes \
            vim \
        && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

WORKDIR /opt

#RUN pip install pyicloud
# Version including folders
RUN pip install icloudpd && \
    pip install git+https://github.com/noizwaves/pyicloud.git@albums-in-folders 
# RUN pip install -r /opt/icloud-sync/requirements.txt
#    pip install pyicloud_ipd

#RUN cd /opt/default && \
#    npm install 
#RUN cd /opt/diff && \
#    npm install

RUN chmod +x /opt/*.sh /opt/*.py
#ENTRYPOINT ["/opt/entry.sh"]
