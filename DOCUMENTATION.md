# Generator Documentation

## Dissecting the Process
The process to generate manifest from RDF data on the fly is relatively
complicated, given the amount of context required. The following steps provide a
sample of how the program operates and what it draws on to accomplish this:

### 1. Decoding RDF into Object Types
RDF objects are first divided into `Media Pages`, `Composites`, `Annotations`,
`Parsed Annotations`, and `Versions`. These provide the basis for creating
manifests since the manifest includes all of these data as a unified document
instead of dividing it among many different documents. Decoding is also
complicated because the data is not stored in a uniform way across the body of
RDF JSON.

### 2. Find Chosen Media Page
This step is to search for the media page in the parsed RDF JSON using the URL
provided by the user. This requires evaluating every URL that exists in the
array and may take a while. Optomizations exist for this.

### 3. Verify Media Page to Image Mapping
In order to identify the correct image, the generator uses the human-defined
mapping of Media Page URLs to image file names. This allows the images to be
stored on an arbitrary IIIF-compatible server and moved around as necessary. As
long as the actual names of the files do not change, the mapping will be
consistent.

Requirements:
  - A complete mapping of Media Page URLs to the image file names must be
    available

*Note: This is an area of active development and needs assistance*

### 4. Fetch Image Dimensions from IIIF Server
The generator dynamically fetches the dimensions of the image from the IIIF
Server, ensuring 1) that the image exists on the server, and 2) that the server
address is valid and accessible.

Requirements:
  - IIIF v3 compatible server must be deployed
  - Images must be uploaded to the server with matching names from step 3

### 5. Fetch Textual Annotations and Location
The textual annotations are located and cross-referenced with the media page
URL, then added to the manifest. These are 1) discovered, 2) scaled according to
the image size found in step 4, 3) attached to the manifest

### 6. Write to file
The generator writes the manifest as a JSON file

*Note: This is an area of active development and needs assistance*

## Format for Images
Images stored in an IIIF compliant image server are expected to be stored in the
following filename. This is standardized to make the migration easier in the
future. All images and URLs for images should use this format after a manifest
has been generated:

```
{project name}_{2 digit volume number}_{3 digit page number}.{extension}
```

For example, `digitalpiranesi_02_012.jpeg` represents the 12th page of the 2nd
volume of the Digital Piranesi project.

