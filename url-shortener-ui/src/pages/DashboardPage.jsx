import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const DashboardPage = () => {
    const [longUrl, setLongUrl] = useState('');
    const [urls, setUrls] = useState([]);
    const [newShortUrl, setNewShortUrl] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const fetchUrls = async () => {
        try {
            const response = await api.get('/my-urls');
            setUrls(response.data);
        } catch (err) {
            console.error("Failed to fetch URLs", err);
            // If token is invalid (e.g., expired), log out user
            if (err.response && err.response.status === 403) {
                handleLogout();
            }
        }
    };

    useEffect(() => {
        fetchUrls();
    }, []);

    const handleShorten = async (e) => {
        e.preventDefault();
        setError('');
        setNewShortUrl('');
        try {
            const response = await api.post('/url', { longUrl });
            setNewShortUrl(response.data.shortUrl);
            setLongUrl(''); // Clear input field
            fetchUrls(); // Refresh the list of URLs
        } catch (err) {
            console.error(err);
            setError('Failed to shorten URL. Please enter a valid URL.');
        }
    };
    
    const handleLogout = () => {
        localStorage.removeItem('token');
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <header className="flex justify-between items-center mb-10">
                <h1 className="text-3xl font-bold text-gray-800">My URLs</h1>
                <button 
                    onClick={handleLogout} 
                    className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
                >
                    Logout
                </button>
            </header>

            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
                <h2 className="text-xl font-semibold mb-4">Create a new short URL</h2>
                <form onSubmit={handleShorten}>
                    <div className="flex items-center">
                        <input
                            type="text"
                            placeholder="Enter a long URL..."
                            className="flex-grow px-4 py-2 border rounded-l-lg focus:outline-none focus:ring focus:ring-blue-200"
                            value={longUrl}
                            onChange={(e) => setLongUrl(e.target.value)}
                            required
                        />
                        <button type="submit" className="bg-blue-500 text-white px-6 py-2 rounded-r-lg hover:bg-blue-600 transition-colors">
                            Shorten
                        </button>
                    </div>
                </form>
                {newShortUrl && (
                    <div className="mt-4 p-3 bg-green-100 text-green-800 rounded-lg">
                        New Short URL:{" "}
                        <a 
                            href={newShortUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="font-bold underline"
                        >
                            {newShortUrl}
                        </a>
                    </div>
                )}
                 {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
                 <h2 className="text-xl font-semibold mb-4">Your Links</h2>
                 <div className="space-y-4">
                    {urls.length > 0 ? (
                        urls.map((url) => (
                            <div key={url.shortUrl} className="p-4 border rounded-lg flex justify-between items-center">
                                <div>
                                    <a 
                                        href={url.shortUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="text-blue-600 font-bold text-lg"
                                    >
                                        {url.shortUrl}
                                    </a>
                                    <p className="text-gray-500 text-sm truncate" style={{maxWidth: '400px'}}>
                                        {url.longUrl}
                                    </p>
                                </div>
                                <p className="text-gray-400 text-sm">
                                    {new Date(url.createdAt).toLocaleDateString()}
                                </p>
                            </div>
                        ))
                    ) : (
                        <p>You haven't created any URLs yet.</p>
                    )}
                 </div>
            </div>
        </div>
    );
};

export default DashboardPage;
