# Ambiyans Ses Dosyaları

Bu klasöre terapi senaryolarında kullanılacak ambiyans ses dosyaları yerleştirilmelidir.

## Gerekli Dosyalar

| Dosya Adı | Açıklama | Önerilen Kaynak |
|-----------|----------|-----------------|
| `rain.mp3` | Yağmur sesi | freesound.org |
| `birds.mp3` | Kuş sesleri | freesound.org |
| `crowd_murmur.mp3` | Hafif kalabalık uğultusu | freesound.org |
| `soft_music.mp3` | Sakin müzik | pixabay.com/music |
| `silence.mp3` | Sessizlik (1 dakika) | FFmpeg ile üretilebilir |

## Lisans

Ambiyans sesleri Creative Commons veya Royalty-Free lisanslı olmalıdır.
Freesound.org'dan indirilen seslerin lisans bilgilerini ayrıca kaydedin.

## Sessizlik Dosyası Üretme

```bash
ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t 60 -q:a 9 -acodec libmp3lame silence.mp3
```
