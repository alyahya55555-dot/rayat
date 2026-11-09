import json, subprocess, os, sys
D = '/home/claude/bena/test/demo-video'
m = json.load(open(D + '/meta.json'))
d, p = m['d'], m['p']
T0 = min(d[0][1], p[0][1])
def concat(lst, sub):
    path = f'{D}/{sub}.txt'
    with open(path, 'w') as f:
        for i, (fn, t) in enumerate(lst):
            dur = (lst[i + 1][1] - t) if i + 1 < len(lst) else 1.0
            f.write(f"file '{D}/{sub}/{fn}'\nduration {max(dur, 0.001):.4f}\n")
        f.write(f"file '{D}/{sub}/{lst[-1][0]}'\n")
    return path
cd, cp = concat(d, 'd'), concat(p, 'p')
od, op, oa = d[0][1] - T0, p[0][1] - T0, m['audioStart'] - T0
end = max(d[-1][1], p[-1][1]) - T0 + 1
out = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/bena/test/vid/demo.mp4'
fc = (f"[1:v]fps=25,scale=1400:788,setpts=PTS+{od:.3f}/TB[dv];"
      f"[2:v]fps=25,scale=443:788,setpts=PTS+{op:.3f}/TB[pv];"
      f"[0:v][dv]overlay=500:180:eof_action=pass[a];[a][pv]overlay=28:180:eof_action=pass,format=yuv420p[v];"
      f"[3:a]adelay={int(oa*1000)}|{int(oa*1000)},volume=1.6[au]")
cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-loop', '1', '-framerate', '25', '-i', '/home/claude/bena/test/vid/bg.png',
       '-f', 'concat', '-safe', '0', '-i', cd, '-f', 'concat', '-safe', '0', '-i', cp, '-i', D + '/audio.webm',
       '-filter_complex', fc, '-map', '[v]', '-map', '[au]', '-t', f'{end:.2f}',
       '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out]
print('offsets', od, op, oa, 'len', end)
subprocess.run(cmd, check=True)
