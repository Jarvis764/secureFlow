import { Router } from 'express';

const router = Router();

// POST / — Start a new scan
router.post('/', (req, res) => {
  res.status(201).json({ message: 'Scan started', scanId: null });
});

// GET / — Get all scans
router.get('/', (req, res) => {
  res.json([]);
});

// GET /:id — Get scan by ID
router.get('/:id', (req, res) => {
  res.json({ message: 'Scan details', id: req.params.id });
});

// GET /:id/dependencies — Get scan dependencies
router.get('/:id/dependencies', (req, res) => {
  res.json([]);
});

export default router;
