#define _POSIX_C_SOURCE 200809L
#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <unistd.h>

/* Only public disposable files. There is no auth loader, provider or model. */
#ifndef PROBE_MODE
#define PROBE_MODE "target"
#endif
static int first = 1;
static void result(const char *id, int ok, int error) {
  printf("%s{\"id\":\"%s\",\"ok\":%s,\"errno\":%d}", first ? "" : ",", id, ok ? "true" : "false", error);
  first = 0;
}
static void file_probe(const char *root, const char *name, const char *id, int flags, int deny) {
#ifdef SCRIPTED_DENIALS
  if (deny) { result(id, 0, EACCES); return; }
#else
  (void)deny;
#endif
  char path[8192];
  if (snprintf(path, sizeof(path), "%s/%s", root, name) >= (int)sizeof(path)) exit(2);
  int fd = open(path, flags, 0600), error = errno;
  int ok = fd >= 0;
  if (ok && !deny) {
    if (flags & O_WRONLY) { const char *text = "allowed-write\n"; ok = write(fd, text, strlen(text)) == (ssize_t)strlen(text); }
    else { char buffer[128]; ssize_t n = read(fd, buffer, sizeof(buffer)); ok = n > 0; }
    if (!ok) error = errno ? errno : EIO;
  }
  if (fd >= 0) close(fd);
  result(id, ok, ok ? 0 : error);
}
static void connect_probe(int port, const char *id, int deny) {
#ifdef SCRIPTED_DENIALS
  if (deny) { result(id, 0, EACCES); return; }
#else
  (void)deny;
#endif
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  if (fd < 0) { result(id, 0, errno); return; }
  struct timeval timeout = {2, 0};
  setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
  struct sockaddr_in peer; memset(&peer, 0, sizeof(peer));
  peer.sin_family = AF_INET; peer.sin_port = htons((unsigned short)port);
  inet_pton(AF_INET, "127.0.0.1", &peer.sin_addr);
  int rc = connect(fd, (struct sockaddr *)&peer, sizeof(peer)), error = errno;
  close(fd); result(id, rc == 0, rc < 0 ? error : 0);
}
int main(int argc, char **argv) {
  if (argc != 4) return 2;
  /* Complete the expected empty-input handshake before a fast probe can exit.
   * The controller must not ignore EPIPE merely because the input is empty. */
  char unexpected; ssize_t input = read(STDIN_FILENO, &unexpected, 1);
  if (input != 0) return 2;
  const char *root = argv[1]; int port = atoi(argv[2]), denied = atoi(argv[3]);
  if (root[0] != '/' || port < 1 || port > 65535 || denied < 1 || denied > 65535 || denied == port) return 2;
  printf("{\"type\":\"host_control_result\",\"mode\":\"" PROBE_MODE "\",\"results\":[");
  file_probe(root, "allowed-read.txt", "read_allowed", O_RDONLY, 0);
  file_probe(root, "scratch/allowed-write", "write_allowed", O_WRONLY|O_CREAT, 0);
  file_probe(root, "protected-canary.txt", "read_protected", O_RDONLY, 0);
  file_probe(root, "forbidden-canary.txt", "read_forbidden", O_RDONLY, 1);
  file_probe(root, "protected-canary.txt", "write_protected", O_WRONLY, 1);
  file_probe(root, "home/.codex/auth-canary-link", "write_auth_link", O_WRONLY, 1);
#ifdef SCRIPTED_DENIALS
  result("replace_protected", 0, EACCES);
  result("unlink_protected", 0, EACCES);
#else
  char from[8192], to[8192];
  snprintf(from, sizeof(from), "%s/scratch/allowed-write", root);
  snprintf(to, sizeof(to), "%s/protected-canary.txt", root);
  int rc = rename(from, to), error = errno; result("replace_protected", rc == 0, rc < 0 ? error : 0);
  rc = unlink(to); error = errno; result("unlink_protected", rc == 0, rc < 0 ? error : 0);
#endif
  connect_probe(port, "connect_allowed", 0);
  connect_probe(denied, "connect_forbidden", 1);
  puts("]}"); return 0;
}
