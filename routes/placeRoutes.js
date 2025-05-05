// routes/placeRoutes.js
const express = require('express');
const router = express.Router();
const placeController = require('../controllers/placeController');

// Ismailia Places Route
router.get('/ismailia', placeController.getIsmailiaPlaces); // Get places in Ismailia

// Google Places Route
router.get('/google-places', placeController.fetchPlacesFromGoogle); // Fetch places from Google Maps

// CRUD Routes
router.post('/', placeController.createPlace); // Create a place
router.get('/', placeController.getAllPlaces); // Get all places
router.get('/nearby', placeController.findNearbyPlaces); // Find nearby places
router.get('/geocode', placeController.geocodeAddress); // Convert address to coordinates
router.get('/:id', placeController.getPlaceById); // Get a place by ID
router.put('/:id', placeController.updatePlace); // Update a place
router.delete('/:id', placeController.deletePlace); // Delete a place

// Geospatial Routes
router.get('/distance/:id', placeController.calculateDistance); // Calculate distance to a place

module.exports = router;