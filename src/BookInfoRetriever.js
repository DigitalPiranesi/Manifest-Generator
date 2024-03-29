/**
 * Authors: Clio Lang, Walter Pach <wpach@email.sc.edu>
 * License: See LICENSE file.
 *
 * This program provides a mechanism for parsing an RDF-JSONLD string into
 * formatted annotations. To use, provide `config` as a Javascript object
 * containing the JSON data.
 *
 * The result of this is an object containing multiple arrays which can be
 * further processed to construct any format you'd like.
 *
 * The function `decode` returns an object with the following properties:
 *    - media_pages - Contains an array of the RDFJSON entries with the media page type
 *    - composites  - Contains an array of the RDFJSON entries with the composite type
 *    - annotations - Contains an array of the RDFJSON entries with the annotation type
 *    - versions    - Contains an array of the RDFJSON entries with the version type
 *    - parsed_annotations - Contains an array of objects with the following format:
 *           {
 *               title     - The title of the annotation
 *               content   - The content of the annotation
 *               xywh      - The coordinates of the annotation
 *               uri       - The uri of the page which the annotation belongs on.
 *                           Note that this URI is a versioned string, including
 *                           the period and version number
 *           }
 *
 * Usage:
 *
 * // Now, parsed_annotations contains an array of the annotations in the format
 * // above.
 * var decoder = new RDFDecoder({...});
 * var arrays = decoder.decode();
 * var parsed_annotations = arrays.parsed_annotations;
 */

const IIIF_SERVER_BASE_URL = "https://env-4072537.us.reclaim.cloud/iiif/2/";
const fs = require('fs');
const config = require('../data/rdf_data.json');
const XMLHttpRequest = require('xhr2');
const I3 = require('@digital-piranesi/iiif-manifest-library').default;
const IMAGE_MAPPING = require('../data/image_mapping_all_volumes').pages;

const IN_EASY_TERMS = {
  ARTSTOR_URL: "http://simile.mit.edu/2003/10/ontologies/artstor#url",
  CONTENT: "https://rdfs.org/sioc/ns#content",
  CREATED: "http://purl.org/dc/terms/created",
  DEFAULT_VIEW: "http://scalar.usc.edu/2012/01/scalar-ns#defaultView",
  DESCRIPTION: "http://purl.org/dc/terms/description",
  HAS_VERSION: "http://purl.org/dc/terms/hasVersion",
  IS_LIVE: "http://scalar.usc.edu/2012/01/scalar-ns#isLive",
  IS_VERSION_OF: "http://purl.org/dc/terms/isVersionOf",
  TYPE: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
  TITLE: "http://purl.org/dc/terms/title",
  URN: "http://scalar.usc.edu/2012/01/scalar-ns#urn",
  VERSION: "http://scalar.usc.edu/2012/01/scalar-ns#version",
  VERSION_NUMBER: "http://open.vocab.org/terms/versionnumber",
  WAS_ATTRIBUTED_TO: "http://www.w3.org/ns/prov#wasAttributedTo",
  HAS_TARGET: "http://www.openannotation.org/ns/hasTarget",
  HAS_BODY: "http://www.openannotation.org/ns/hasBody",
  CONTENT: "http://rdfs.org/sioc/ns#content"
};

const RDF_SYNTAX_TYPES = {
  COMPOSITE: "http://scalar.usc.edu/2012/01/scalar-ns#Composite",
  VERSION: "http://scalar.usc.edu/2012/01/scalar-ns#Version",
  MEDIA: "http://scalar.usc.edu/2012/01/scalar-ns#Media",
  ANNOTATION: "http://www.openannotation.org/ns/Annotation",
  INVALID_TYPE: -1
};

/**
 * Issue an HTTP request with optional headers, body, and parameters.
 *
 * @param method HTTP method
 * @param url the URL to request
 * @param options an object with headers or parameters (in JSON)
 */
const request = function(method, url, options){
  return new Promise(function(resolve, reject){
    var request = new XMLHttpRequest();

    request.open(method, url);
    request.onload = function(){
      if(request.status >= 200 && request.status < 300){
        resolve(request.response);
      }else{
        reject({
          status: request.status,
          statusText: request.statusText
        });
      }
    };
    request.onerror = function(){
      reject({
        status: request.status,
        statusText: request.statusText
      });
    };

    if(options.headers){
      Object.keys(options.headers).forEach(function(key){
        request.setRequestHeader(key, options.headers[key]);
      });
    }

    if(options.params){
      console.log(JSON.stringify(options.params));
      request.setRequestHeader("Content-type", "application/json");
      request.send(JSON.stringify(options.params));
    }else{
      request.send();
    }
  });
};

/**
 * Version: 0.1
 */
class RDFDecoder {
  /**
   * Constructs a new RDFJSON decoder
   *
   * @param obj A JavaScript object (not string) that contains the RDFJSON.
   */
  constructor(obj) {
    this.obj = obj;
  }

  /**
   * Determine if a specific object/property is defined
   *
   * @param a The object to check
   * @return True if the object is defined according to a type check.
   */
  is_defined(a){
    return (typeof a !== "undefined");
  }

  is_date(a){
    return (Object.prototype.toString.call(a) === '[object Date]');
  }

  /**
   * Get the type of the child element
   *
   * @param child The uri of which to fetch the type
   * @return The type using the standard format or -1 if invalid.
   * @see RDF_SYNTAX_TYPES
   */
  get_type(child) {
    if (!this.is_defined(this.obj[child])) {
      console.log("Child: " + child + " not defined");
      return RDF_SYNTAX_TYPES.INVALID_TYPE;
    }

    if (!this.is_defined(this.obj[child][IN_EASY_TERMS.TYPE])) {
      return RDF_SYNTAX_TYPES.INVALID_TYPE;
    }

    return this.obj[child][IN_EASY_TERMS.TYPE][0].value;
  }

  /**
   * Check if the element is live or not
   *
   * @param child The uri of which to fetch the status.
   * @return A positive integer if live, otherwise -1
   */
  is_live(child) {
    if (!this.is_defined(this.obj[child]) || !this.is_defined(this.obj[child][IN_EASY_TERMS.IS_LIVE])) {
      return -1;
    }

    var live = parseInt(this.obj[child][IN_EASY_TERMS.IS_LIVE][0].value);

    if (!live || isNaN(live)) {
      return -1;
    }

    return live;
  }

  /**
   * Get the target of an element.
   *
   * In the case of RDFJSON, the target is similar to the IIIF target idea.
   * The target will be a URI pointing to a version of a page, with a hashtag
   * followed by the x,y coordinates and the width and height of the box.
   *
   * @note There are no null-checks for the return values
   * @param child The uri of which to fetch the target
   * @return An object containing two properties: `base_uri` and `xywh` which is the target's uri and coordinates respectively.
   */
  get_target(child) {
    if (!this.is_defined(this.obj[child]) || !this.is_defined(this.obj[child][IN_EASY_TERMS.HAS_TARGET])) {
      return -1;
    }

    var raw_string = this.obj[child][IN_EASY_TERMS.HAS_TARGET][0].value;
    var array_of_strings = raw_string.split("#");
    var base_uri = array_of_strings[0];
    var uri = base_uri.substring(0, base_uri.length - 2);

    if(typeof array_of_strings[1] === "undefined"){
      return -1;
    }

    var xywh = array_of_strings[1].split("=")[1];

    return {
      base_uri: base_uri,
      uri: uri,
      xywh: xywh
    };
  }

  /**
   * Get the version (uri) of an element.
   *
   * In RDFJSON, versions are noted by a period, followed by the version number
   * on the URI. For example, the third version of "digitalpiranesi.org/test_page"
   * is "digitalpiranesi.org/test_page.3"
   *
   * This method will return the full URI version string as above, not the number.
   *
   * @param child The uri of which to fetch the version uri
   * @return A string uri of the version.
   */
  get_version(child) {
    if (!this.is_defined(this.obj[child]) || !this.is_defined(this.obj[child][IN_EASY_TERMS.VERSION])) {
      return -1;
    }

    return this.obj[child][IN_EASY_TERMS.VERSION][0].value;
  }

  /**
   * Get the content of an annotation.
   *
   * @note This method only opperates on RDF_SYNTAX_TYPES.ANNOTATION type elements.
   * @param child The uri of which to fetch the content
   * @return A string containing the content.
   */
  get_content(child) {
    if (!this.is_defined(this.obj[child]) || !this.is_defined(this.obj[child][IN_EASY_TERMS.CONTENT])) {
      return -1;
    }

    return this.obj[child][IN_EASY_TERMS.CONTENT][0].value;
  }

  /**
   * Get the title of an element.
   *
   * @param child The uri of which to fetch the title.
   * @return A string of the title
   */
  get_title(child) {
    if (!this.is_defined(this.obj[child]) || !this.is_defined(this.obj[child][IN_EASY_TERMS.TITLE])) {
      return -1;
    }

    return this.obj[child][IN_EASY_TERMS.TITLE][0].value;
  }

  /**
   * Get the description of an element.
   *
   * @param child The uri of which to fetch the title.
   * @return A string of the description.
   */
  get_description(child) {
    if (!this.is_defined(this.obj[child]) || !this.is_defined(this.obj[child][IN_EASY_TERMS.DESCRIPTION])) {
      return -1;
    }

    return this.obj[child][IN_EASY_TERMS.DESCRIPTION][0].value;
  }

  get_artstor_url(child) {
    if (!this.is_defined(this.obj[child]) || !this.is_defined(this.obj[child][IN_EASY_TERMS.ARTSTOR_URL])) {
      return -1;
    }

    return this.obj[child][IN_EASY_TERMS.ARTSTOR_URL][0].value;
  }

  get_created_date_as_date_string(child) {
    if (!this.is_defined(this.obj[child]) || !this.is_defined(this.obj[child][IN_EASY_TERMS.CREATED])) {
      return -1;
    }

    return this.obj[child][IN_EASY_TERMS.CREATED][0].value;
  }

  get_created_date_as_date_object(child) {
    var date = new Date(this.get_created_date_as_date_string(this.obj[child]));

    if (!this.is_date(date)) {
      return -1;
    }

    return date;
  }

  is_version_of(child) {
    if (!this.is_defined(this.obj[child]) || !this.is_defined(this.obj[child][IN_EASY_TERMS.IS_VERSION_OF])) {
      return -1;
    }

    return this.obj[child][IN_EASY_TERMS.IS_VERSION_OF][0].value;
  }

  /**
   * Decode the provided object into arrays of different structures:
   *
   * {
   *     media_pages        - An array of uris with the Media type
   *     composites         - An array of uris with the Composite type
   *     annotations        - An array of uris with the Annotation type
   *     versions           - An array of uris with the Version type
   *     parsed_annotations - An array of parsed annotations.
   *         {
   *             title
   *             content
   *             xywh
   *             uri
   *         }
   * }
   */
  decode() {
    var config = this.obj;
    var media_pages = [];
    var composites = [];
    var annotations = [];
    var versions = [];

    /*
     * Parsed format:
     *
     * {
     *   title,
     *   content,
     *   xywh,
     *   uri,
     * }
     */
    var parsed_annotations = [];

    for (const item in config) {
      switch (this.get_type(item)) {
        case RDF_SYNTAX_TYPES.MEDIA:
          media_pages.push(item);
          break;
        case RDF_SYNTAX_TYPES.ANNOTATION:
          annotations.push(item);
          break;
        case RDF_SYNTAX_TYPES.COMPOSITE:
          composites.push(item);
          break;
        case RDF_SYNTAX_TYPES.VERSION:
          versions.push(item);
          break;
        default:
          console.log("  Unknown type: " + this.get_type(item) + ". Please review: " + item);
          break;
      }
    }

    /*console.log("Media: " + JSON.stringify(media_pages));
    console.log("Composites: " + JSON.stringify(composites));
    console.log("Annotations: " + JSON.stringify(annotations));
    console.log("Versions: " + JSON.stringify(versions));*/

    /*
     * 1. Find the `Media` page
     * 2. Check for it's current version
     * 3. Find the version within the file
     *     a. `Type` is Version
     *     b. `isVersionOf` is `Media` page uri
     * 4. Find annotations
     *     a. `Type` is Annotation
     *     b. Check for correct target (uri and version from step 3; avoids version conflicts)
     *     c. Find the "composite" body with the `hasBody` property
     *         I. Get title from `title` property
     *         II. Get content from `content` property
     *     d. Position using the `hasTarget` parsed string
     */
    for (const media_page_uri of media_pages) {
      // 1
      if (!this.is_live(media_page_uri)) {
        continue;
      }

      // 2
      var version_string = this.get_version(media_page_uri);

      // 3a
      if (version_string < 0 || versions.indexOf(version_string) < 0) {
        console.log("Cannot parse version. Skipping.");
        continue;
      }

      var version = config[version_string];

      // 3b
      if (this.is_version_of(version_string) != media_page_uri) {
        continue;
      }

      // 4, 4a
      for (const anno of annotations) {
        // 4b
        if (!this.get_target(anno) || this.get_target(anno).base_uri != version_string) {
          continue;
        }

        var annotation_body_uri = config[anno][IN_EASY_TERMS.HAS_BODY][0].value;
        var annotation_title = this.get_title(annotation_body_uri);
        var annotation_content = this.get_content(annotation_body_uri);
        var target = this.get_target(anno);

        var xywh = {x: 0, y: 0, w: 0, h: 0, multW: false, multH: false};

        xywh.x = parseFloat(target.xywh.split(",")[0]) / 100;
        xywh.y = parseFloat(target.xywh.split(",")[1]) / 100;

        if (target.xywh.split(",")[2] != undefined && target.xywh.split(",")[2].includes("%")) {
            xywh.w = parseFloat(target.xywh.split(",")[2]) / 100;
            xywh.multW = true;
        } else {
            xywh.w = target.xywh.split(",")[2];
        }

        if (target.xywh.split(",")[3] != undefined && target.xywh.split(",")[3].includes("%")) {
            xywh.h = parseFloat(target.xywh.split(",")[3]) / 100;
            xywh.multH = true;
        } else {
            xywh.h = target.xywh.split(",")[3];
        }

        parsed_annotations.push({
          title: annotation_title || "",
          content: annotation_content || "",
          xywh: target.xywh || "",
          int_xywh: xywh,
          uri: `${target.uri}`
        });
      }
    }

    return {
      media_pages: media_pages,
      composites: composites,
      annotations: annotations,
      parsed_annotations: parsed_annotations,
      versions: versions
    }
  }
}

/**
 * Calculates finalized points for annotations/completes percentage to pixel format
 * @param anno_link is manifest annotation link
 * @param width of image
 * @param height of image
 * @param target is target canvas link
 * @return textualAnnotation
 */
function calculate_annotations(annotationObject, width, height, target) {
  x = parseInt(annotationObject.int_xywh.x * width);
  y = parseInt(annotationObject.int_xywh.y * height);

  return new I3.ItemTextualAnnotation(
    "uri",
    "commenting",
    `${annotationObject.title} ${annotationObject.content}`,
    "en",
    `${target}#xywh=${x},${y},${annotationObject.int_xywh.w},${annotationObject.int_xywh.h}`
  );
}

/**
 * Fetches the width and height of an image from the canteloupe server's `info.json` file
 * for that image asynchronously.
 *
 * @param image The image to fetch (e.g. "pantheon.jpg")
 * @return An object with the `width` and `height` properties
 * @throws Error
 */
async function getImageWidthAndHeightDataFromServer(imageUrl){
   var req = await request("GET", `${IIIF_SERVER_BASE_URL}${imageUrl}/info.json`, {});

   try {
       var responseString = await req;
       var response = JSON.parse(responseString);

       if(response.width !== undefined && response.height !== undefined){
         return {
           width: response.width,
           height: response.height
         };
       }else{
         throw new Error("Could not fetch width and height from server. Double check URLs");
       }
   } catch (e) {
       throw new Error("There was an error with the dimension request. Please verify image exists");
   }
}

async function generate_manifest(page_url, arrays) {
  console.log(`Generating manifest for page: ${page_url}`);

  // Note: I think this can be sped up
  for(const url of arrays.media_pages){
    if(!url.includes(page_url)){
      continue;
    }

    console.log(`Beginning construction for: ${url}`);
    // TODO: Look into whether this has to be the actual URL of the manifest
    var manifestID = "EDIT_ME_TO_MATCH_URL_AND_FILE_PATH.json";
    var canvasID   = url + "/canvas/p1";
    var webAnnotationPageID = url + "/page/p1/1";
    var annotationPageID = url + "/page/p2/1";
    var webAnnotationImageID = url + "/annotation/p1-image";

    if (IMAGE_MAPPING[url] === undefined || !IMAGE_MAPPING[url]) {
        throw Error(`Media page url "${url}" not found in image mapping. Please verify that an entry has been made.`);
        return null;
    } else {
        console.log(`Using image file: ${IMAGE_MAPPING[url]["name"]}`);
    }

    try {
        var imageURL = `${IIIF_SERVER_BASE_URL}${IMAGE_MAPPING[url]["name"]}/full/full/0/default.jpg`;
        var imageDimensions = await getImageWidthAndHeightDataFromServer(IMAGE_MAPPING[url]["name"]);
        var imageWidth = imageDimensions.width;
        var imageHeight = imageDimensions.height;
    } catch(e){
        console.log(`Unable to connect to server.`);
        return null;
    }

    var manifest = new I3.Manifest(3, manifestID);
    var canvas = new I3.ItemCanvas(canvasID, imageWidth, imageHeight);
    var webAnnotationPage = new I3.ItemWebAnnotationPage(webAnnotationPageID);
    var annotationPage = new I3.ItemAnnotationPage(annotationPageID);
    var image = new I3.ItemWebAnnotationImage(webAnnotationImageID, "painting", canvas, imageURL, imageWidth, imageHeight);
        image.addContext("http://iiif.io/api/presentation/3/context.json");

    webAnnotationPage.addItem(image);
    canvas.addItem(webAnnotationPage);
    manifest.addItem(canvas);

    var i = 0;

    // Find all annotations for this page.
    for(const annotation of arrays.parsed_annotations){
      if(annotation.uri == url){
        i++;
        var target_x = (annotation.int_xywh.x * imageWidth) | 0;
        var target_y = (annotation.int_xywh.y * imageHeight) | 0;
        var target_w = annotation.int_xywh.w;
        var target_h = annotation.int_xywh.h;

        if (annotation.int_xywh.multW) {
            target_w *= imageWidth;
            target_w |= 0;
        }

        if (annotation.int_xywh.multH) {
            target_h *= imageHeight;
            target_h |= 0;
        }

        console.log(`Annotation: ${annotation.xywh}`);
        var textAnnotation = new I3.ItemTextualAnnotation(url + "/annotation/t" + i, 
            "painting", 
            annotation.title + " " + annotation.content, 
            "en", 
            `${annotation.uri}#xywh=${target_x},${target_y},${target_w},${target_h}`
        );
        annotationPage.addItem(textAnnotation);
      }
    }

    if(annotationPage.getItems().length > 0) {
        canvas.addAnnotationPage(annotationPage);
    }

    return JSON.stringify(JSON.parse(manifest.toJSONString()), null, 2);
  }
}

(async function(){
    if(!Array.isArray(process.argv) || process.argv.length < 3) {
        console.log(`usage: ${process.argv[1]} <page url>`);
        return;
    }

    var page_urls = [];
    for(var i = 2; i < process.argv.length; i++) {
        page_urls.push(process.argv[i]);
    }

    var decoder = new RDFDecoder(config);

    console.log(`Beginning decoding (this may take some time)...`);
    var arrays = decoder.decode();

    for(const media_page of page_urls) {
        var manifest = await generate_manifest(media_page, arrays);

        if(manifest != null) {
            console.log(`\n${manifest}\n`);
            console.log("===================");
        } else {
            console.log(`\nFailed to generate manifest for: ${media_page}\n`);
        }
    }
})();
