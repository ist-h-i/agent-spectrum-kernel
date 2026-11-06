#!/usr/bin/env python3
"""Model-free fixture: no network, subprocess, model, or task implementation."""
import json,sys,uuid
data=sys.stdin.read();work=sys.argv[sys.argv.index('-C')+1]
print(json.dumps(dict(type='thread.started',thread_id=str(uuid.uuid5(uuid.NAMESPACE_URL,work)))))
print(json.dumps(dict(type='turn.completed',usage=dict(input_tokens=7,cached_input_tokens=0,cache_write_input_tokens=0,output_tokens=3,reasoning_output_tokens=0,total_tokens=10))))
