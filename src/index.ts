import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth'; // ✅ 1. Import the route
import dashboardRoutes from './routes/dashboard';
import tenderRoutes from './routes/tenders';

dotenv.config();


const app = express();
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());
app.use('/api/auth', authRoutes);   
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/tenders', tenderRoutes);

app.get('/', (req, res) => {
  res.send('API running!');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
