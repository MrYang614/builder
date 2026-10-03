"""Original CC0-style procedural textures authored for this editor. No external assets."""
from pathlib import Path
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parent.parent/'apps/desktop/src/assets'
root.mkdir(parents=True,exist_ok=True)
brick=Image.new('RGB',(128,128),(205,191,170));d=ImageDraw.Draw(brick)
for row in range(4):
 for col in range(-1,5):
  x=col*64+(32 if row%2 else 0)
  d.rectangle((x+2,row*32+2,x+61,row*32+29),fill=(153+row*4,79+row*3,58+row*3))
brick.save(root/'brick.png')
wood=Image.new('RGB',(128,128),(174,132,85));d=ImageDraw.Draw(wood)
for x in range(0,128,32):
 d.line((x,0,x,127),fill=(112,81,53),width=2)
 for dx in (7,14,21):d.line((x+dx,0,x+dx+2,127),fill=(161,119,74))
wood.save(root/'wood.png')
tile=Image.new('RGB',(128,128),(213,220,219));d=ImageDraw.Draw(tile)
d.rectangle((2,2,125,125),outline=(174,184,181),width=2)
tile.save(root/'tile.png')
plaster=Image.new('RGB',(128,128),(233,226,212));d=ImageDraw.Draw(plaster)
for y in range(128):
 for x in range(128):
  n=((x*31+y*17)%7)-3;plaster.putpixel((x,y),(233+n,226+n,212+n))
plaster.save(root/'plaster.png')
