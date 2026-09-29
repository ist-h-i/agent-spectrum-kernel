#define _POSIX_C_SOURCE 200809L
#include <arpa/inet.h>
#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>
#ifndef SCENARIO
#define SCENARIO "success"
#endif
static void quote(FILE *f, const char *s) {
  fputc('"', f);
  for (; *s; s++) {
    unsigned char ch = (unsigned char)*s;
    if (ch == '"' || ch == '\\') { fputc('\\', f); fputc(ch, f); }
    else if (ch < 32) fprintf(f, "\\u%04x", ch);
    else fputc(ch, f);
  }
  fputc('"', f);
}
static char *read_file(const char *path) {
  FILE *f = fopen(path, "r"); if (!f) exit(5);
  char *bytes = calloc(1024*1024, 1); if (!bytes) exit(6);
  size_t n = fread(bytes, 1, 1024*1024-1, f); bytes[n] = 0; fclose(f); return bytes;
}
static void unquote(const char *s, char *out) {
  size_t n = strlen(s); if (n < 2 || n > 8192 || s[0] != '"' || s[n-1] != '"') exit(3);
  memcpy(out, s+1, n-2); out[n-2] = 0;
}
int main(int argc, char **argv) {
  signal(SIGPIPE, SIG_IGN);
  if (getenv("OPENAI_API_KEY") || getenv("CODEX_AUTH_TOKEN")) return 90;
  if (!strcmp(SCENARIO, "timeout")) { sleep(10); return 1; }
  if (!strcmp(SCENARIO, "invalid_stream")) { puts("invalid-json"); fflush(stdout); sleep(1); return 1; }
  if (!strcmp(SCENARIO, "tool_event")) { puts("{\"type\":\"item.started\",\"item\":{\"type\":\"command_execution\"}}"); fflush(stdout); sleep(1); return 1; }
  if (!strcmp(SCENARIO, "zero")) return 1;
  char instruction[8192]={0}, schema[8192]={0}, base[8192]={0};
  for (int i=1; i<argc-1; i++) {
    if (!strcmp(argv[i], "--output-schema")) snprintf(schema, sizeof(schema), "%s", argv[i+1]);
    if (!strcmp(argv[i], "-c")) {
      const char *v=argv[i+1], *key="model_instructions_file=";
      if (!strncmp(v,key,strlen(key))) unquote(v+strlen(key),instruction);
      key="model_providers.capture.base_url=";
      if (!strncmp(v,key,strlen(key))) unquote(v+strlen(key),base);
    }
  }
  int port=0; if (sscanf(base, "http://127.0.0.1:%d/v1", &port)!=1 || port<1 || !instruction[0] || !schema[0]) return 3;
  char *input=calloc(1024*1024,1); if(!input)return 6;
  size_t n=fread(input,1,1024*1024-1,stdin);input[n]=0;
  char *instructions=read_file(instruction), *schema_json=read_file(schema);
  FILE *f=tmpfile(); if(!f)return 7;
  fputs("{\"model\":\"gpt-6-sol\",\"reasoning\":{\"effort\":\"medium\"},\"instructions\":",f);quote(f,instructions);
  fputs(",\"input\":[{\"type\":\"message\",\"role\":\"user\",\"content\":[{\"type\":\"input_text\",\"text\":",f);quote(f,input);
  fputs("}]}],\"tools\":",f);fputs(!strcmp(SCENARIO,"tools") ? "[{\"type\":\"function\",\"name\":\"shell\"}]" : "[]",f);
  fputs(",\"text\":{\"format\":{\"type\":\"json_schema\",\"strict\":true,\"name\":\"output\",\"schema\":",f);
  fputs(schema_json,f);fputs("}}}",f);fflush(f);
  long length=ftell(f);rewind(f);char *body=calloc((size_t)length+1,1);if(!body)return 6;fread(body,1,(size_t)length,f);fclose(f);
  for(int k=0;k<(!strcmp(SCENARIO,"multiple")?2:1);k++) {
    int fd=socket(AF_INET,SOCK_STREAM,0);if(fd<0)return 8;
    struct sockaddr_in peer;memset(&peer,0,sizeof(peer));peer.sin_family=AF_INET;peer.sin_port=htons((unsigned short)port);inet_pton(AF_INET,"127.0.0.1",&peer.sin_addr);
    if(connect(fd,(struct sockaddr*)&peer,sizeof(peer))<0)return 9;
    FILE *out=fdopen(fd,"w");if(!out)return 10;
    fprintf(out,"POST /v1/responses HTTP/1.1\r\nHost: 127.0.0.1:%d\r\nContent-Type: application/json\r\nContent-Length: %ld\r\nConnection: close\r\n",port,length);
    if(!strcmp(SCENARIO,"authorization")) fputs("Authorization: synthetic-marker-not-a-credential\r\n",out);
    fputs("\r\n",out);fwrite(body,1,(size_t)length,out);fflush(out);
    char response[4096];(void)read(fd,response,sizeof(response));fclose(out);
  }
  free(body);free(input);free(instructions);free(schema_json);
  puts("{\"type\":\"error\",\"message\":\"local rejecting endpoint\"}");
  /* These tails follow a fully captured request and deliberately omit LF. */
  if (!strcmp(SCENARIO, "invalid_tail")) fputs("{broken", stdout);
  if (!strcmp(SCENARIO, "tool_tail")) fputs("{\"type\":\"item.started\",\"item\":{\"type\":\"command_execution\"}}", stdout);
  return 1;
}
