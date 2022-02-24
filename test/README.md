```
$ docker pull matrixdotorg/synapse:latest
$ docker build -t matrix-public-archive-test-homeserver -f test/dockerfiles/Synapse.Dockerfile test/dockerfiles/
```

```
docker-compose -f test/docker-compose.yml up -d --no-recreate
```

```
$ docker ps --all | grep test_hs
$ docker logs test_hs1_1
$ docker logs test_hs2_1

$ docker stop test_hs1_1 test_hs2_1
$ docker rm test_hs1_1 test_hs2_1
```
