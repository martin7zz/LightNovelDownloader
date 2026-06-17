const { parseDocument } = require('htmlparser2');
const { findAll, getText } = require('domutils');

const { getCorrectOlElement } = require('../downloader/olElementGetter');

const API_URL = 'https://jnovels.com/wp-json/wp/v2/posts';

function filterDownloadLinks(olListElements) {
  let anchors = [];

  if (olListElements.length > 0) {
    // Count <a> tags inside only the filtered <ol> elements
    for (let ol of olListElements) {
      const links = findAll(el =>
        el.name === 'a' &&
        el.attribs?.href &&
        (() => {
          const text = getText(el).toLowerCase();
          return text.includes('volume') || text.includes('download');
        })(),
        [ol]
      );
      anchors.push(...links);
    }
  } else {
    // Fall back to counting all <a> tags in the full document
    anchors = findAll(el =>
      el.name === 'a' &&
      el.attribs?.href &&
      (() => {
        const text = getText(el).toLowerCase();
        return text.includes('volume') || text.includes('download');
      })(),
      doc.children
    );
  }

  return anchors
}

function DownloadLinksGetter(seriesName, html){
  const doc = parseDocument(html);

  // Get the result object from checkerFromHTML
  const result = getCorrectOlElement(seriesName, doc);

  // Pull out only the relevant <ol> elements
  const filteredOlElements = result?.ols ?? [];

  olElements = filterDownloadLinks(filteredOlElements);

  return olElements
}


function countDownloadLinks(downloadLinks) {
  return downloadLinks.length;
}

async function fetchPostBySlug(slug, originalUrl) {
  try {
    const res = await fetch(`${API_URL}?slug=${slug}&_fields=title,link,content`);
    if (res.ok) {
      const json = await res.json();
      if (json.length > 0) return json[0];
    }
  } catch (err) {
    console.error('Failed to fetch initial slug:', err);
  }

  // If first slug fails, resolve correct slug from original link
  try {
    const redirectRes = await fetch(originalUrl, {
      method: 'HEAD',
      redirect: 'follow',
    });

    const finalUrl = redirectRes.url;
    const correctedSlug = new URL(finalUrl).pathname.replace(/^\/|\/$/g, '');

    if (correctedSlug && correctedSlug !== slug) {
      const retryRes = await fetch(`${API_URL}?slug=${correctedSlug}&_fields=title,link,content`);
      if (retryRes.ok) {
        const retryJson = await retryRes.json();
        if (retryJson.length > 0) {
          console.log(`Corrected slug: ${slug} → ${correctedSlug}`);
          return retryJson[0];
        }
      }
    }
  } catch (err) {
    console.error(`Failed to resolve slug via redirect for: ${originalUrl}`);
  }

  return null;
}

async function extractSlugFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/^\/|\/$/g, '');
  } catch {
    return '';
  }
}


module.exports = { countDownloadLinks,  DownloadLinksGetter, filterDownloadLinks, extractSlugFromUrl, fetchPostBySlug};