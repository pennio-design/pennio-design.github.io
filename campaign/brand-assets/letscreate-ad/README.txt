Let's Create motion ad, 9:16, 15 s, 30 fps.
ad.html is a pure function of time (window.render(t)), so every frame is exact.
1. node render-frames.js   (writes JPG frames; set the output folder at the top)
2. python3 make-audio.py   (synthesised sound design, no music)
3. ffmpeg -framerate 30 -i frames/f_%04d.jpg -i ad-audio.wav -c:v libx264 -crf 15 -pix_fmt yuv420p \
     -c:a aac -b:a 192k -af "loudnorm=I=-16:TP=-1.5:LRA=7,afade=t=out:st=14.2:d=0.8" -movflags +faststart out.mp4
Copy only: every line is from the approved poster, site and page copy. No dates, no new claims.
