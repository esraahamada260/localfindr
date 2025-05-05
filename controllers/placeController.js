// controllers/placeController.js
const Place = require('../models/Place');
const axios = require('axios');

// Helper function to wait (used for next_page_token)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Create a new place
exports.createPlace = async (req, res) => {
  try {
    const { name, category, longitude, latitude } = req.body;
    const place = new Place({
      name,
      category,
      location: {
        type: 'Point',
        coordinates: [longitude, latitude],
      },
    });
    await place.save();
    res.status(201).json(place);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get all places
exports.getAllPlaces = async (req, res) => {
  try {
    const places = await Place.find();
    res.json(places);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get a place by ID
exports.getPlaceById = async (req, res) => {
  try {
    const place = await Place.findById(req.params.id);
    if (!place) return res.status(404).json({ message: 'Place not found' });
    res.json(place);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update a place
exports.updatePlace = async (req, res) => {
  try {
    const { name, category, longitude, latitude } = req.body;
    const place = await Place.findById(req.params.id);
    if (!place) return res.status(404).json({ message: 'Place not found' });

    place.name = name || place.name;
    place.category = category || place.category;
    if (longitude && latitude) {
      place.location = {
        type: 'Point',
        coordinates: [longitude, latitude],
      };
    }
    await place.save();
    res.json(place);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete a place
exports.deletePlace = async (req, res) => {
  try {
    const place = await Place.findById(req.params.id);
    if (!place) return res.status(404).json({ message: 'Place not found' });
    await place.remove();
    res.json({ message: 'Place deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Find nearby places by category
exports.findNearbyPlaces = async (req, res) => {
  try {
    const { longitude, latitude, category, radius } = req.query;
    const radiusInMeters = parseFloat(radius) * 1000; // Convert km to meters

    const places = await Place.find({
      category,
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
          $maxDistance: radiusInMeters,
        },
      },
    }).limit(5);

    res.json(places);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Calculate distance to a place
exports.calculateDistance = async (req, res) => {
  try {
    const { longitude, latitude } = req.query;
    const place = await Place.findById(req.params.id);
    if (!place) return res.status(404).json({ message: 'Place not found' });

    const result = await Place.aggregate([
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
          distanceField: 'distance',
          spherical: true,
        },
      },
      { $match: { _id: place._id } },
    ]);

    if (!result.length) return res.status(404).json({ message: 'Place not found' });
    res.json({ place: result[0], distance: result[0].distance });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Convert address to coordinates using Google Maps Geocoding API
exports.geocodeAddress = async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) {
      return res.status(400).json({ message: 'Address is required' });
    }

    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        address,
        key: process.env.GOOGLE_MAPS_API_KEY,
      },
    });

    const data = response.data;
    if (data.status !== 'OK' || !data.results.length) {
      return res.status(400).json({ message: 'Could not geocode address', details: data.status });
    }

    const { lat, lng } = data.results[0].geometry.location;
    res.json({
      address: data.results[0].formatted_address,
      latitude: lat,
      longitude: lng,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error geocoding address', error: error.message });
  }
};

// Fetch places from Google Maps Places API for Ismailia and store in MongoDB
exports.fetchPlacesFromGoogle = async (req, res) => {
  try {
    // Default to Ismailia center and 20km radius
    const latitude = 30.6043; // Ismailia center
    const longitude = 32.2723;
    const radius = 20000; // 20km to cover Ismailia
    const types = ['cafe', 'restaurant', 'pharmacy', 'tourist_attraction']; // Types to fetch

    // Map Google Places types to our categories
    const categoryMap = {
      cafe: 'cafe',
      restaurant: 'restaurant',
      pharmacy: 'pharmacy',
      tourist_attraction: 'other',
      default: 'other',
    };

    let allPlaces = [];
    for (const type of types) {
      let nextPageToken = null;
      do {
        const params = {
          location: `${latitude},${longitude}`,
          radius, // In meters
          type,
          key: process.env.GOOGLE_MAPS_API_KEY,
        };
        if (nextPageToken) {
          params.pagetoken = nextPageToken;
        }

        const response = await axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json', {
          params,
        });

        const data = response.data;
        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
          return res.status(400).json({ message: 'Error fetching places', details: data.status });
        }

        const places = data.results.map((place) => ({
          name: place.name,
          category: categoryMap[type] || categoryMap.default,
          location: {
            type: 'Point',
            coordinates: [place.geometry.location.lng, place.geometry.location.lat],
          },
          placeId: place.place_id, // Add Google Place ID
        }));

        allPlaces = allPlaces.concat(places);
        nextPageToken = data.next_page_token;

        // Wait 2 seconds before requesting the next page (Google API requirement)
        if (nextPageToken) {
          await delay(2000);
        }
      } while (nextPageToken && allPlaces.length < 60); // Limit to 60 results per type (3 pages max)
    }

    // Store places in MongoDB, update if placeId exists, insert if not
    const bulkOps = allPlaces.map((place) => ({
      updateOne: {
        filter: { placeId: place.placeId },
        update: { $set: place },
        upsert: true, // Insert if not exists
      },
    }));

    // Clear existing data (optional, remove if you want to keep old data)
    await Place.deleteMany({});

    // Perform bulk write
    await Place.bulkWrite(bulkOps);

    res.json({ message: 'Places from Ismailia fetched and stored', count: allPlaces.length, places: allPlaces });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching places', error: error.message });
  }
};

// Get places in Ismailia
exports.getIsmailiaPlaces = async (req, res) => {
  try {
    const latitude = 30.6043; // Ismailia center
    const longitude = 32.2723;
    const radiusInMeters = 20000; // 20km to cover Ismailia
    const category = req.query.category; // Optional category filter

    const query = {
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude],
          },
          $maxDistance: radiusInMeters,
        },
      },
    };

    if (category) {
      query.category = category; // Add category filter if provided
    }

    const places = await Place.find(query);
    console.log(`Found ${places.length} places in Ismailia`);

    if (!places || places.length === 0) {
      return res.status(404).json({ message: 'لم يتم العثور على أماكن في الإسماعيلية' });
    }

    res.status(200).json({ message: 'تم جلب الأماكن بنجاح', data: places });
  } catch (error) {
    console.error('خطأ في جلب الأماكن:', error);
    res.status(500).json({ message: 'خطأ في السيرفر' });
  }
};