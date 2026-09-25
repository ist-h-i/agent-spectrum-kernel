/* Test-only native process. No sockets, exec, provider, credentials or evaluator. */
#define _POSIX_C_SOURCE 200809L
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

static volatile sig_atomic_t stopping = 0;
static void stop(int signal_number) { (void)signal_number; stopping = 1; }
static void fail(const char *message) { perror(message); exit(70); }
static void write_all(int fd, const void *data, size_t length) {
  const unsigned char *p = data;
  while (length) {
    ssize_t written = write(fd, p, length);
    if (written < 0 && errno == EINTR) continue;
    if (written <= 0) fail("fake write");
    p += written; length -= (size_t)written;
  }
}
static int capture_file(const char *directory, const char *suffix) {
  char path[PATH_MAX];
  int size = snprintf(path, sizeof path, "%s/%ld.%s", directory, (long)getpid(), suffix);
  if (size < 0 || (size_t)size >= sizeof path) { errno = ENAMETOOLONG; fail("fake capture"); }
  int fd = open(path, O_WRONLY | O_CREAT | O_EXCL, 0600);
  if (fd < 0) fail("fake capture open");
  return fd;
}
static void null_string(int fd, const char *value) {
  if (!value) value = "";
  write_all(fd, value, strlen(value) + 1);
}
static void sleep_tick(void) {
  struct timespec delay = {0, 20000000};
  (void)nanosleep(&delay, NULL);
}
static pid_t make_child(const char *directory) {
  int barrier[2];
  if (pipe(barrier)) fail("fake pipe");
  pid_t child = fork();
  if (child < 0) fail("fake fork");
  if (child == 0) {
    close(barrier[0]);
    int devnull = open("/dev/null", O_RDWR);
    if (devnull < 0) _exit(71);
    for (int fd = 0; fd < 3; ++fd) if (dup2(devnull, fd) < 0) _exit(71);
    if (devnull > 2) close(devnull);
    struct sigaction action; memset(&action, 0, sizeof action);
    action.sa_handler = stop; sigemptyset(&action.sa_mask);
    if (sigaction(SIGTERM, &action, NULL) || sigaction(SIGINT, &action, NULL)) _exit(71);
    char ready = 'R'; write_all(barrier[1], &ready, 1); close(barrier[1]);
    for (int ticks = 0; !stopping && ticks < 1500; ++ticks) sleep_tick();
    _exit(0);
  }
  close(barrier[1]);
  char ready = 0; ssize_t n;
  do { n = read(barrier[0], &ready, 1); } while (n < 0 && errno == EINTR);
  close(barrier[0]);
  if (n != 1 || ready != 'R') { kill(child, SIGKILL); waitpid(child, NULL, 0); fail("fake child readiness"); }
  int fd = capture_file(directory, "child");
  char line[64]; int count = snprintf(line, sizeof line, "%ld\n", (long)child);
  write_all(fd, line, (size_t)count); close(fd);
  return child;
}
int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--version") == 0) {
    puts("codex-cli 0.153.4"); return 0;
  }
  if (argc == 3 && strcmp(argv[1], "exec") == 0 && strcmp(argv[2], "--help") == 0) {
    puts("--ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check --json --model --config --sandbox --output-schema --output-last-message");
    return 0;
  }
  const char *directory = getenv("ASK_SUCCESSOR_FAKE_CAPTURE");
  const char *mode = getenv("ASK_SUCCESSOR_FAKE_MODE");
  if (!directory || !mode || argc < 3 || strcmp(argv[1], "exec") || strcmp(argv[argc - 1], "-")) return 64;
  if (strcmp(mode, "success") && strcmp(mode, "failure") && strcmp(mode, "failure-complete") && strcmp(mode, "provider-limit") && strcmp(mode, "residual") && strcmp(mode, "timeout") && strcmp(mode, "invalid-utf8")) return 64;
  const char *output = NULL;
  for (int i = 2; i < argc - 1; ++i) {
    const char *arg = argv[i];
    if (!strcmp(arg, "--ephemeral") || !strcmp(arg, "--ignore-user-config") || !strcmp(arg, "--ignore-rules") || !strcmp(arg, "--skip-git-repo-check") || !strcmp(arg, "--json")) continue;
    if (!strcmp(arg, "--model") || !strcmp(arg, "--sandbox") || !strcmp(arg, "--output-schema") || !strcmp(arg, "--output-last-message") || !strcmp(arg, "-c")) {
      if (i + 1 >= argc - 1) return 64;
      const char *value = argv[++i];
      if (!strcmp(arg, "--model") && strcmp(value, "synthetic-native-fake-not-a-service")) return 64;
      if (!strcmp(arg, "--sandbox") && strcmp(value, "workspace-write")) return 64;
      if (!strcmp(arg, "-c") && strcmp(value, "model_reasoning_effort=\"medium\"") && strcmp(value, "approval_policy=\"never\"") && strcmp(value, "sandbox_workspace_write.network_access=false")) return 64;
      if (!strcmp(arg, "--output-last-message")) { if (output) return 64; output = value; }
      continue;
    }
    return 64;
  }
  if (!output) return 64;
  int fd = capture_file(directory, "argv");
  for (int i = 1; i < argc; ++i) null_string(fd, argv[i]);
  close(fd);
  fd = capture_file(directory, "meta");
  char cwd[PATH_MAX]; if (!getcwd(cwd, sizeof cwd)) fail("fake cwd");
  null_string(fd, cwd); null_string(fd, getenv("CODEX_HOME")); null_string(fd, mode);
  close(fd);
  fd = capture_file(directory, "stdin");
  unsigned char buffer[4096]; size_t total = 0;
  for (;;) {
    ssize_t n = read(STDIN_FILENO, buffer, sizeof buffer);
    if (n < 0 && errno == EINTR) continue;
    if (n < 0) fail("fake stdin");
    if (n == 0) break;
    total += (size_t)n;
    if (total > 1048576) { close(fd); return 65; }
    write_all(fd, buffer, (size_t)n);
  }
  close(fd);
  if (!strcmp(mode, "failure")) { puts("{\"type\":\"turn.completed\"}"); fputs("intentional native fake failure\n", stderr); return 7; }
  if (!strcmp(mode, "timeout")) {
    struct sigaction action; memset(&action, 0, sizeof action);
    action.sa_handler = stop; sigemptyset(&action.sa_mask);
    if (sigaction(SIGTERM, &action, NULL)) fail("fake sigaction");
    pid_t child = make_child(directory);
    /* A completion-looking event does not override a process timeout. */
    puts("{\"type\":\"turn.completed\"}"); fflush(stdout);
    for (int ticks = 0; !stopping && ticks < 500; ++ticks) sleep_tick();
    kill(child, SIGTERM);
    while (waitpid(child, NULL, 0) < 0) if (errno != EINTR) fail("fake waitpid");
    return 143;
  }
  if (!strcmp(mode, "residual")) (void)make_child(directory);
  fd = open(output, O_WRONLY | O_CREAT | O_EXCL, 0600);
  if (fd < 0) fail("fake output");
  const char *json = "{\"task_type\":\"implementation\",\"decision\":\"not_applicable\",\"findings\":[],\"requirement_status\":[],\"verification_commands\":[],\"completion_claim\":\"complete\",\"route\":null,\"summary\":\"Synthetic native transport fixture. No model or evaluator.\"}\n";
  write_all(fd, json, strlen(json)); close(fd);
  puts("{\"type\":\"turn.started\"}");
  if (!strcmp(mode, "provider-limit")) {
    puts("{\"type\":\"error\",\"message\":\"You've hit your usage limit. Try again later.\"}");
    puts("{\"type\":\"turn.failed\",\"error\":{\"codex_error_info\":\"usage_limit_exceeded\",\"message\":\"synthetic provider limit\"}}");
    fputs("synthetic provider usage limit\n", stderr); return 7;
  }
  if (!strcmp(mode, "invalid-utf8")) {
    fputs("{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"", stdout);
    fputc(0xff, stdout);
    puts("\"}}");
    fputc(0xff, stderr); fputc(0xfe, stderr); fputc('\n', stderr);
  }
  puts("{\"type\":\"turn.completed\",\"usage\":{\"input_tokens\":100,\"cached_input_tokens\":80,\"output_tokens\":20}}");
  if (!strcmp(mode, "failure-complete")) {
    fputs("intentional native failure after complete usage\n", stderr); return 7;
  }
  return 0;
}
