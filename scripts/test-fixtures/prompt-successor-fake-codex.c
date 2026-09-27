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
/* Synthetic diagnostics mirror the CLI's observable record shape for contract
 * tests. They are not provider, authentication, or actual host-policy proof. */
static const char *fake_private_root(int argc, char **argv, char root[PATH_MAX]) {
  const char *private_root = NULL;
  for (int i = 2; i + 1 < argc; ++i) if (!strcmp(argv[i], "-c")) {
    const char *setting = argv[++i];
    const char *prefix = "permissions.ask_issue291.filesystem={ \"";
    if (strncmp(setting, prefix, strlen(prefix))) continue;
    const char *start = setting + strlen(prefix);
    const char *end = strchr(start, '"');
    if (!end || end == start || (size_t)(end - start) >= PATH_MAX) return NULL;
    memcpy(root, start, (size_t)(end - start)); root[end - start] = '\0';
    private_root = root;
  }
  return private_root;
}
static int fake_debug_prompt_input(int argc, char **argv) {
  char root[PATH_MAX];
  const char *private_root = fake_private_root(argc, argv, root);
  if (!private_root) return 64;
  printf("[{\"role\":\"developer\",\"content\":[{\"text\":\"<permissions instructions> `sandbox_mode` is `workspace-write`. Network access is restricted. Approval policy is currently never. - path `%s`\"}]}]\n", private_root);
  return 0;
}
static int fake_sandbox_probe(int argc, char **argv) {
  int separator = -1;
  for (int i = 2; i < argc; ++i) if (!strcmp(argv[i], "--")) separator = i;
  if (separator < 0 || separator + 3 >= argc || strcmp(argv[separator + 1], "/bin/sh")
      || strcmp(argv[separator + 2], "-c")) return 64;
  const char *script = argv[separator + 3];
  if (!strcmp(script, "exit 0") && separator + 4 == argc) return 0;
  if (!strcmp(script, "exec 3< \"$1\"") && separator + 6 == argc) {
    fputs("Permission denied\n", stderr); return 1;
  }
  return 64;
}
static int fake_diagnostic_session(int argc, char **argv, const char *output) {
  const char *home = getenv("CODEX_HOME");
  char private_root_buffer[PATH_MAX];
  const char *private_root = fake_private_root(argc, argv, private_root_buffer);
  char cwd[PATH_MAX], path[PATH_MAX], session_id[80], turn_id[80];
  if (!home || !private_root || !getcwd(cwd, sizeof cwd)) return 64;
  if (snprintf(path, sizeof path, "%s/sessions", home) >= (int)sizeof path || mkdir(path, 0700)) return 65;
  if (snprintf(path, sizeof path, "%s/sessions/2026", home) >= (int)sizeof path || mkdir(path, 0700)) return 65;
  if (snprintf(path, sizeof path, "%s/sessions/2026/09", home) >= (int)sizeof path || mkdir(path, 0700)) return 65;
  if (snprintf(path, sizeof path, "%s/sessions/2026/09/27", home) >= (int)sizeof path || mkdir(path, 0700)) return 65;
  snprintf(session_id, sizeof session_id, "synthetic-session-%ld", (long)getpid());
  snprintf(turn_id, sizeof turn_id, "synthetic-turn-%ld", (long)getpid());
  if (snprintf(path, sizeof path, "%s/sessions/2026/09/27/rollout-%ld.jsonl", home, (long)getpid()) >= (int)sizeof path) return 65;
  int fd = open(path, O_WRONLY | O_CREAT | O_EXCL, 0600);
  if (fd < 0) fail("fake diagnostic session");
  FILE *session = fdopen(fd, "w");
  if (!session) fail("fake diagnostic session stream");
  fprintf(session, "{\"type\":\"session_meta\",\"payload\":{\"id\":\"%s\",\"cwd\":\"%s\",\"cli_version\":\"0.153.4\",\"model_provider\":\"openai\"}}\n", session_id, cwd);
  fprintf(session, "{\"type\":\"turn_context\",\"payload\":{\"turn_id\":\"%s\",\"cwd\":\"%s\",\"model\":\"synthetic-native-fake-not-a-service\",\"effort\":\"medium\",\"approval_policy\":\"never\",\"sandbox_policy\":{\"type\":\"workspace-write\",\"network_access\":false},\"permission_profile\":{\"type\":\"managed\",\"network\":\"restricted\",\"file_system\":{\"type\":\"restricted\",\"entries\":[{\"path\":{\"type\":\"path\",\"path\":\"%s\"},\"access\":\"deny\"}]}},\"active_permission_profile\":{\"id\":\"ask_issue291\"}}}\n", turn_id, cwd, private_root);
  if (fclose(session)) fail("fake diagnostic session close");
  fd = open(output, O_WRONLY | O_CREAT | O_EXCL, 0600);
  if (fd < 0) fail("fake diagnostic output");
  const char *json = "{\"task_type\":\"review\",\"decision\":\"not_applicable\",\"findings\":[],\"requirement_status\":[],\"verification_commands\":[],\"completion_claim\":\"not_applicable\",\"route\":null,\"summary\":\"Synthetic diagnostic only.\"}\n";
  write_all(fd, json, strlen(json)); close(fd);
  printf("{\"type\":\"thread.started\",\"thread_id\":\"%s\"}\n", session_id);
  puts("{\"type\":\"turn.started\"}");
  puts("{\"type\":\"turn.completed\"}");
  return 0;
}
int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--version") == 0) {
    puts("codex-cli 0.153.4"); return 0;
  }
  if (argc == 3 && strcmp(argv[1], "exec") == 0 && strcmp(argv[2], "--help") == 0) {
    puts("--ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check --json --model --config --sandbox --output-schema --output-last-message");
    puts("Run without persisting session files to disk");
    return 0;
  }
  if (argc == 3 && !strcmp(argv[1], "login") && !strcmp(argv[2], "status")) {
    puts("Logged in using ChatGPT"); return 0;
  }
  if (argc >= 3 && !strcmp(argv[1], "debug") && !strcmp(argv[2], "prompt-input")) return fake_debug_prompt_input(argc, argv);
  if (argc >= 3 && !strcmp(argv[1], "sandbox") && !strcmp(argv[2], "-P")) return fake_sandbox_probe(argc, argv);
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
      /* The ordinary contained-runner timeout control still uses the legacy
       * workspace-write flag. Successor sessions use the explicit profile. */
      if (!strcmp(arg, "--sandbox") && (strcmp(mode, "timeout") || strcmp(value, "workspace-write"))) return 64;
      if (!strcmp(arg, "-c") && strcmp(value, "model_reasoning_effort=\"medium\"") && strcmp(value, "approval_policy=\"never\"")
          && strcmp(value, "default_permissions=\"ask_issue291\"") && strcmp(value, "permissions.ask_issue291.extends=\":workspace\"")
          && strcmp(value, "permissions.ask_issue291.network.enabled=false")
          && strncmp(value, "permissions.ask_issue291.filesystem={ ", 38)) return 64;
      if (!strcmp(arg, "--output-last-message")) { if (output) return 64; output = value; }
      continue;
    }
    return 64;
  }
  if (!output) return 64;
  int diagnostic = 1;
  for (int i = 2; i < argc - 1; ++i) if (!strcmp(argv[i], "--ephemeral")) diagnostic = 0;
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
  if (diagnostic) return fake_diagnostic_session(argc, argv, output);
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
