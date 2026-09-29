#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/stat.h>
#include <time.h>

/* Native protocol fixture only. It has no provider implementation or auth. */
static void quote(FILE *f, const char *s) {
  fputc('"',f);
  for (;*s;s++) { if (*s=='"'||*s=='\\') fputc('\\',f); if (*s=='\n') fputs("\\n",f); else fputc(*s,f); }
  fputc('"',f);
}
static int extract(const char *p, const char *key, char *out, size_t size) {
  char pattern[128]; snprintf(pattern,sizeof(pattern),"\"%s\":\"",key);
  const char *value=strstr(p,pattern); if (!value) return 0; value+=strlen(pattern);
  const char *end=strchr(value,'"'); if (!end || (size_t)(end-value)>=size) return 0;
  memcpy(out,value,(size_t)(end-value)); out[end-value]=0; return 1;
}
static void session(FILE *f,const char *id,const char *turn,const char *cwd,const char *model,const char *output) {
  fprintf(f,"{\"type\":\"session_meta\",\"payload\":{\"id\":\"%s\",\"cli_version\":\"0.153.4\",\"model_provider\":\"fake\",\"cwd\":",id);
  quote(f,cwd); fputs("}}\n{\"type\":\"turn_context\",\"payload\":{\"turn_id\":",f);quote(f,turn);
  fputs(",\"model\":",f);quote(f,model);fputs(",\"effort\":\"medium\",\"cwd\":",f);quote(f,cwd);
  fputs(",\"approval_policy\":\"never\",\"sandbox_policy\":{\"type\":\"read-only\",\"network_access\":false}}}\n",f);
  fprintf(f,"{\"type\":\"event_msg\",\"payload\":{\"type\":\"task_started\",\"turn_id\":\"%s\"}}\n",turn);
  fputs("{\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":",f);quote(f,output);fputs("}]}}\n",f);
  fputs("{\"type\":\"event_msg\",\"payload\":{\"type\":\"agent_message\",\"message\":",f);quote(f,output);fputs("}}\n",f);
  fprintf(f,"{\"type\":\"event_msg\",\"payload\":{\"type\":\"task_complete\",\"turn_id\":\"%s\",\"last_agent_message\":",turn);quote(f,output);fputs("}}\n",f);
}
int main(int argc,char **argv) {
  if (getenv("OPENAI_API_KEY") || getenv("CODEX_AUTH_TOKEN") || getenv("CUSTOM_SECRET")) return 90;
  if (argc==2 && !strcmp(argv[1],"--version")) { puts("codex-cli 0.153.4");return 0; }
  if (argc==3 && !strcmp(argv[1],"exec") && !strcmp(argv[2],"--help")) {
    puts("--json --model --sandbox --output-schema --output-last-message --skip-git-repo-check");return 0;
  }
  if (argc!=13 || strcmp(argv[1],"exec") || strcmp(argv[2],"--json") || strcmp(argv[3],"--skip-git-repo-check")
    || strcmp(argv[4],"--model") || strcmp(argv[5],"scripted") || strcmp(argv[6],"--sandbox")
    || strcmp(argv[7],"read-only") || strcmp(argv[8],"--output-schema") || strcmp(argv[10],"--output-last-message") || strcmp(argv[12],"-")) return 91;
  char cwd[4096],path[8192],config[8192]; if (!getcwd(cwd,sizeof(cwd)) || !getenv("CODEX_HOME") || !getenv("HOME")) return 92;
  snprintf(path,sizeof(path),"%s/config.toml",getenv("CODEX_HOME")); FILE *f=fopen(path,"r"); if (!f) return 93;
  size_t n=fread(config,1,sizeof(config)-1,f); config[n]=0;fclose(f);
  if (!strstr(config,"approval_policy = \"never\"") || !strstr(config,"shell_tool = false") || !strstr(config,"web_search = \"disabled\"")) return 94;
  snprintf(path,sizeof(path),"%s/auth.json",getenv("CODEX_HOME"));if (!access(path,F_OK)) return 95;
  char *input=calloc(1024*1024,1); if (!input) return 96;
  n=fread(input,1,1024*1024-1,stdin);input[n]=0;
  if (strstr(input,"private_binding") || strstr(input,"current_prompt") || strstr(input,"case_class") || strstr(input,"expected_verdict")) return 97;
  char sample[100],criterion[100],quoted[512];if (!extract(input,"sample_id",sample,sizeof(sample)) || !extract(input,"criterion_id",criterion,sizeof(criterion))) return 98;
  const char *target=strstr(input,"\"document_id\":\"target-output\"");
  if (!target || !extract(target,"text",quoted,sizeof(quoted))) return 105;
  char id[100],turn[100],output[4096];snprintf(id,sizeof(id),"native-session-%ld",(long)getpid());snprintf(turn,sizeof(turn),"native-turn-%ld",(long)getpid());
  if (strstr(input,"case:reuse")) strcpy(id,"native-session-reused");
  FILE *buffer=tmpfile(); if (!buffer) return 106;
  fprintf(buffer,"{\"schema_version\":\"1.0.0\",\"sample_id\":\"%s\",\"criteria\":[",sample);
  const char *cursor=input;int items=0;
  while ((cursor=strstr(cursor,"\"criterion_id\":\"")) && cursor<target) {
    if (!extract(cursor,"criterion_id",criterion,sizeof(criterion))) return 107;
    if(items++)fputc(',',buffer);
    fprintf(buffer,"{\"criterion_id\":\"%s\",\"verdict\":\"pass\",\"reason_code\":\"satisfied\",\"brief_rationale\":\"Scripted native test.\",\"evidence_references\":[{\"document_id\":\"target-output\",\"start_line\":1,\"end_line\":1,\"quote\":",criterion);
    quote(buffer,quoted);fputs("}],\"examined_documents\":[]}",buffer);cursor+=strlen("\"criterion_id\":\"");
  }
  fputs("]}",buffer);fflush(buffer);long size=ftell(buffer);if(size<0||(size_t)size>=sizeof(output))return 108;
  rewind(buffer);size_t outputSize=fread(output,1,sizeof(output)-1,buffer);output[outputSize]=0;fclose(buffer);
  if (strstr(input,"case:invalid")) strcpy(output,"not JSON");
  printf("{\"type\":\"thread.started\",\"thread_id\":\"%s\"}\n{\"type\":\"turn.started\"}\n",id);fflush(stdout);
  if (strstr(input,"case:tool")) { puts("{\"type\":\"item.started\",\"item\":{\"id\":\"x\",\"type\":\"command_execution\"}}");fflush(stdout);sleep(20);return 0; }
  if (strstr(input,"case:timeout")) {sleep(20);return 0;}
  if (strstr(input,"case:overflow")) {for (int i=0;i<23*1024*1024;i++) fputc('x',stdout);fflush(stdout);return 0;}
  if (strstr(input,"case:exit")) return 7;
  if (strstr(input,"case:workspace")) {f=fopen("unexpected.txt","w");if(!f)return 99;fputs("unexpected",f);fclose(f);}
  snprintf(path,sizeof(path),"%s/sessions",getenv("CODEX_HOME"));if (mkdir(path,0700))return 100;
  snprintf(path,sizeof(path),"%s/sessions/capture.jsonl",getenv("CODEX_HOME"));f=fopen(path,"w");if(!f)return 101;
  session(f,id,turn,cwd,strstr(input,"case:runtime")?"wrong-model":"scripted",output);fclose(f);
  if (strstr(input,"case:multiple-sessions")) {snprintf(path,sizeof(path),"%s/sessions/second.jsonl",getenv("CODEX_HOME"));f=fopen(path,"w");if(!f)return 102;session(f,id,turn,cwd,"scripted",output);fclose(f);}
  f=fopen(argv[11],"w");if(!f)return 103;fputs(output,f);fputc('\n',f);fclose(f);
  fputs("{\"type\":\"item.completed\",\"item\":{\"id\":\"answer\",\"type\":\"agent_message\",\"text\":",stdout);quote(stdout,output);fputs("}}\n",stdout);
  if(strstr(input,"case:unknown-usage"))puts("{\"type\":\"turn.completed\"}");
  else puts("{\"type\":\"turn.completed\",\"usage\":{\"input_tokens\":10,\"output_tokens\":12,\"cached_input_tokens\":2}}");
  fflush(stdout);
  if (strstr(input,"case:residual")) {pid_t pid=fork();if(pid==0){sleep(20);_exit(0);} if(pid<0)return 104;}
  free(input);return 0;
}
