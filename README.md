# Manifest Generator
An automated program to generate IIIF Presentation Manifests from static,
downloaded RDF-JSON data. Provides a command-line interface for parsing and
converting all necessary elements into an IIIF Manifest.

## Installation
1. Clone this repository
2. Install dependencies by running `npm install` from within the folder

## Usage
1. Generate a manifest by running `node src/BookInfoRetriever.js <media page
url> [... more urls]` to generate a manifest for the given media page.
2. Copy the output JSON and paste into a text file.
3. Edit the `EDIT_ME` portions of the text as appropriate
4. Upload text file in deployment environment

Example:
```sh
$ node src/BookInfoRetriever.js https://my.site/media_page
Beginning decoding...
Generating manifest for page: https://my.site/media_page
Beginning construction for: https://my.site/media_page
Using image file: image.jpeg

{
  ...manifest
}
```

## Important Links
* [Cantaloupe Main Page](https://cantaloupe-project.github.io/)
* [Expiremental Scalar Webbsite](http://piranesi-test.reclaim.hosting/)
* [IIIF Presentation API Documentation](https://iiif.io/api/presentation/3.0/)
* [IIIF Manifest Validator](https://iiif.io/api/presentation/validator/service/)
* [IIIF Workshop](https://training.iiif.io/iiif-1-day-workshop/image-api/)
* [Mirador Main Page](https://projectmirador.org/)
