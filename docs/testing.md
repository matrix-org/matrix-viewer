# Testing

## Setup

If you haven't setup `matrix-public-archive` yet, see the [_Setup_ section in the root `README.md`](../README.md#setup)

Then we need to setup the federation cluster of homeservers that we will test with.
Sorry, this isn't automated yet when you run the tests 🙇

```sh
# Build the test homeserver image that are pre-configured to federate with each other
$ docker pull matrixdotorg/synapse:latest
$ docker build -t matrix-public-archive-test-homeserver -f test/dockerfiles/Synapse.Dockerfile test/dockerfiles/

# Start the test homeservers
$ docker-compose --project-name matrix_public_archive_test -f test/docker-compose.yml up -d --no-recreate
```

## Running the tests

```sh
$ npm run test
```

Or if you want to keep Matrix Public Archive server running after the tests run and
explore the UI from the interactive URL's printed on the screen to better debug, use:

```sh
$ npm run test-interactive
```

Caveat: You might not see the same result that a test is seeing when visiting the
interactive URL. Some tests set config like the `archiveMessageLimit` which is reset
after each test case unless you are using `npm run test-interactive` and visiting the
interactive URL for a failed test. Otherwise, we reset config between each test case so
they don't leak and contaminate each other.

### Developer utility

Some copy-pasta to help you manage the Docker containers for the test homeservers:

```sh
$ docker ps --all | grep test_hs
$ docker logs -f --tail 10 matrix_public_archive_test_hs1_1
$ docker logs -f --tail 10 matrix_public_archive_test_hs2_1

$ docker stop matrix_public_archive_test_hs1_1 matrix_public_archive_test_hs2_1
$ docker rm matrix_public_archive_test_hs1_1 matrix_public_archive_test_hs2_1
```
