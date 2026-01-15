let map;
let geocoder;
let bounds;
let parsedRows = [];   // normalized sales_data for ARV
let markers = [];
let subjectMarker = null;

function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 32.815, lng: -97.268 }, // DFW-ish default
    zoom: 11
  });
  geocoder = new google.maps.Geocoder();
  bounds = new google.maps.LatLngBounds();
}

window.addEventListener('load', () => {
  initMap();

  document.getElementById('runMap').addEventListener('click', handleRunMap);
  document.getElementById('runArv').addEventListener('click', handleRunArv);
  document.getElementById('fileInput').addEventListener('change', handleFileSelect);
});

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      parsedRows = normalizeRows(results.data);
      alert(`Loaded ${parsedRows.length} records from CSV`);
    }
  });
}

function normalizeRows(rows) {
  return rows.map((rowRaw) => {
    const row = {};
    const lowerKeys = {};
    Object.keys(rowRaw).forEach(k => {
      lowerKeys[k.toLowerCase()] = rowRaw[k];
    });

    const salePrice = lowerKeys['sale_price'] || lowerKeys['price'] || '';
    const address = lowerKeys['address'] || lowerKeys['street_address'] || '';
    const city = lowerKeys['city'] || '';
    const state = lowerKeys['state'] || lowerKeys['st'] || '';
    const zip = lowerKeys['zipcode'] || lowerKeys['zip'] || '';
    const bldgArea = lowerKeys['bldg_area'] || lowerKeys['living_area_sqft'] || lowerKeys['sqft'] || '';
    const beds = lowerKeys['total_bed'] || lowerKeys['beds'] || '';
    const baths = lowerKeys['total_bath'] || lowerKeys['baths'] || '';
    const saleDate = lowerKeys['sale_date'] || lowerKeys['closed_date'] || '';
    const lotArea = lowerKeys['lot_area'] || lowerKeys['lot_sqft'] || '';
    const zUrl = lowerKeys['zillow_url'] || lowerKeys['property_url'] || '';

    let propertyUrl = zUrl;
    if (typeof propertyUrl === 'string' && propertyUrl.includes('|')) {
      propertyUrl = propertyUrl.split('|')[0];
    }

    return {
      sale_price: parseMoney(salePrice),
      street_address: address,
      city,
      state,
      zip,
      living_area_sqft: parseNumber(bldgArea),
      beds: parseInt(beds || 0, 10) || null,
      baths: parseInt(baths || 0, 10) || null,
      sale_date: saleDate,
      lot_sqft: parseNumber(lotArea),
      property_url: propertyUrl || null,
      _raw: rowRaw
    };
  }).filter(r => r.street_address && r.city && r.state);
}

function parseMoney(str) {
  if (!str) return null;
  const num = parseFloat(String(str).replace(/[^0-9.]/g, ''));
  return isNaN(num) ? null : num;
}

function parseNumber(str) {
  if (!str) return null;
  const num = parseFloat(String(str).replace(/[^0-9.]/g, ''));
  return isNaN(num) ? null : num;
}

function handleRunMap() {
  if (!parsedRows.length) {
    alert('Please upload a CSV first.');
    return;
  }

  clearMarkers();
  bounds = new google.maps.LatLngBounds();

  parsedRows.forEach((row, idx) => {
    const fullAddress = `${row.street_address}, ${row.city}, ${row.state} ${row.zip || ''}`;
    const infoHtml = `
      <div>
        <strong>${row.sale_price ? `$${row.sale_price.toLocaleString()}` : 'Price N/A'}</strong><br/>
        ${fullAddress}<br/>
        Beds: ${row.beds ?? '-'}, Baths: ${row.baths ?? '-'}<br/>
        SF: ${row.living_area_sqft ?? '-'} | Lot: ${row.lot_sqft ?? '-'}<br/>
        Date: ${row.sale_date || '-'}
      </div>
    `;
    const url = row.property_url;

    setTimeout(() => {
      geocodeAndPlace(fullAddress, infoHtml, url);
    }, idx * 150);
  });

  const subjAddress = document.getElementById('subjectAddress').value.trim();
  if (subjAddress) {
    geocodeSubject(subjAddress);
  }
}

function geocodeAndPlace(address, infoHtml, url) {
  geocoder.geocode({ address }, (results, status) => {
    if (status !== 'OK' || !results[0]) return;

    const position = results[0].geometry.location;
    const marker = new google.maps.Marker({
      map,
      position
    });

    const infoWindow = new google.maps.InfoWindow({ content: infoHtml });

    marker.addListener('mouseover', () => infoWindow.open(map, marker));
    marker.addListener('mouseout', () => infoWindow.close());
    marker.addListener('click', () => { if (url) window.open(url, '_blank'); });

    markers.push(marker);
    bounds.extend(position);
    map.fitBounds(bounds);
  });
}

function geocodeSubject(address) {
  geocoder.geocode({ address }, (results, status) => {
    if (status !== 'OK' || !results[0]) return;

    const position = results[0].geometry.location;

    if (subjectMarker) subjectMarker.setMap(null);
    subjectMarker = new google.maps.Marker({
      map,
      position,
      icon: { url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png' }
    });

    bounds.extend(position);
    map.fitBounds(bounds);
  });
}

function clearMarkers() {
  markers.forEach(m => m.setMap(null));
  markers = [];
  if (subjectMarker) {
    subjectMarker.setMap(null);
    subjectMarker = null;
  }
}

async function handleRunArv() {
  const address = document.getElementById('subjectAddress').value.trim();
  if (!address) {
    alert('Enter a subject address first.');
    return;
  }
  if (!parsedRows.length) {
    alert('Upload and parse a CSV first.');
    return;
  }

  const sf = Number(document.getElementById('subjectSf').value) || null;
  const beds = Number(document.getElementById('subjectBeds').value) || null;
  const baths = Number(document.getElementById('subjectBaths').value) || null;

  const payload = {
    subject: {
      address,
      living_area_sqft: sf,
      beds,
      baths
    },
    sales_data: parsedRows
  };

  const reportDiv = document.getElementById('report');
  reportDiv.textContent = 'Running ARV underwriting... this can take a moment.';

  try {
    const res = await fetch('/api/arv-underwrite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.error) {
      reportDiv.textContent = 'Error: ' + data.error;
    } else {
      reportDiv.textContent = data.report || 'No report returned.';
    }
  } catch (err) {
    console.error(err);
    reportDiv.textContent = 'Error calling ARV underwriting API.';
  }
}
