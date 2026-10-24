# RS92: key a Flow (Veo) Leo clip from green, crop to Leo and the ring, feather the sides, clear the top/bottom rows.
# usage: sh keyleo.sh <in.mp4> <out.webm|out.webp> [seek]
K="format=rgba,geq=r='r(X,Y)':g='min(g(X,Y),max(r(X,Y),b(X,Y))+12)':b='b(X,Y)':a='255-clip((min(g(X,Y)-r(X,Y),g(X,Y)-b(X,Y))-28)*5,0,255)',crop=760:720:300:0,scale=560:-2,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lt(Y,4)+gt(Y,H-5),0,alpha(X,Y)*min(1,min(X,W-1-X)/50))'"
case "$2" in
  *.webp) ffmpeg -v error -y -ss "${3:-7.95}" -i "$1" -frames:v 1 -vf "$K" -c:v libwebp -quality 85 "$2" ;;
  *) ffmpeg -v error -y -i "$1" -vf "$K,format=yuva420p" -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 38 -row-mt 1 -an "$2" ;;
esac
