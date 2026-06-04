#docker run --name hello --rm -p 3000:3000 -v ./data:/data/hello -v ./config:/app/config hello-server:1.3
docker run --name hello --rm -p 3000:3000 -v ./config:/app/config hello-server:1.3
