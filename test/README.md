```
docker build -t matrix-public-archive-test-homeserver -f test/dockerfiles/Synapse.Dockerfile test/dockerfiles/
```

```
docker-compose -f test/docker-compose.yml up -d --no-recreate
```
