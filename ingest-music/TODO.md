- Don't show results of tool check unless failed
- Add configuration for temporary directoy location; defaulty to system tmpdir
- Files that are not music files from archive should also be copied
- Look for music files recursively, they may not be at root
- Remove special characers from filenames (no unicode, no backticks, no slashes or backslashes)
- Date should be templatable like YYYY-MM-DD
- In our test the path was :  "P:/MusicLibrary/LiveMusic/Phish/1999-07-10 - Camden, NJ (Live Phish Vol. 8) [FLAC], /1999-07-10 S1 T01 - Wilson.flac"
  But it should be "P:/MusicLibrary/LiveMusic/Phish/1999-07-10 - E Centre, Camden, NJ/1999-07-10 S1 T01 - Wilson.flac"
- All song titles and venue names should be PascalCased
