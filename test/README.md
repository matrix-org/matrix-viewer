```sh
$ docker pull matrixdotorg/synapse:latest
$ docker build -t matrix-public-archive-test-homeserver -f test/dockerfiles/Synapse.Dockerfile test/dockerfiles/
```

```sh
$ docker-compose --project-name matrix_public_archive_test -f test/docker-compose.yml up -d --no-recreate
```

```sh
$ docker ps --all | grep test_hs
$ docker logs -f --tail 10 matrix_public_archive_test_hs1_1
$ docker logs -f --tail 10 matrix_public_archive_test_hs2_1

$ docker stop matrix_public_archive_test_hs1_1 matrix_public_archive_test_hs2_1
$ docker rm matrix_public_archive_test_hs1_1 matrix_public_archive_test_hs2_1
```
