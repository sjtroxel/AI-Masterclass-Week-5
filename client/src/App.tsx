import { Routes, Route } from 'react-router-dom';
import Header from './components/Header.js';
import Footer from './components/Footer.js';
import HomePage from './pages/HomePage.js';
import SearchPage from './pages/SearchPage.js';
import PosterDetailPage from './pages/PosterDetailPage.js';
import SeriesPage from './pages/SeriesPage.js';
import AboutPage from './pages/AboutPage.js';

export default function App() {
  return (
    <div className="flex min-h-screen flex-col bg-surface text-text font-sans">
      <Header />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/poster/:id" element={<PosterDetailPage />} />
        <Route path="/series/:slug" element={<SeriesPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
      <Footer />
    </div>
  );
}
