

## TODO

[x] if a file is not FLAC, it must be converted, even if no audio sampling conversion is needed
[x] Splitting tracks cannot be done in the source folder. If we have to split tracks, they must be first copied to tmp
[x] We need to sort numbers correctly when they are part of the original track - if it starts with a #, then parse it after
[x] similar to our "--split" option, let's add "--merge" to merge tracks like '--merge "D1T01 D1T02 ...". This should error if merging non-sequential tracks
[x] Phish imports don't handle country correctly, missing from api?
[x] Allow downloading a show direct from a URL. Provide config for temporary location in case conversion fails. This can be a top-level config - we don't need this per band
[ ] Add integration tests that use LLM to test the prompt engineering. These should have a separate pnpm script to run and not normally run
[ ] We should be able to handle incomplete shows (e.g. one set) - as long as there are fewer tracks and we match them all by name
[ ] When we enter a previously unknown band, add config for it
[ ] Preprocss an archive by extracting any text or markdown files and try to identify the artist with using regex pattern matching. If multiple matches occur, ask
[ ] Add a --debug options; emit curl statement for API calls
[ ] Add code using our callbacl/plugin pattern to parse artist & date from filenames
[ ] Allow choosing an image; resize to 400x400 and save as "cover.jpg"