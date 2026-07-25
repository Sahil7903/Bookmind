// Elements
const searchInput = document.getElementById('search-input');
const resultsGrid = document.getElementById('results-grid');
const searchLoading = document.getElementById('search-loading');
const geminiKeyInput = document.getElementById('gemini-key');
const saveKeyBtn = document.getElementById('save-key-btn');

// Modal Elements
const aiModal = document.getElementById('ai-modal');
const closeModal = document.getElementById('close-modal');
const modalTitle = document.getElementById('modal-title');
const modalAuthor = document.getElementById('modal-author');
const modalYear = document.getElementById('modal-year');
const modalIsbn = document.getElementById('modal-isbn');
const modalCover = document.getElementById('modal-cover');
const generateBtn = document.getElementById('generate-btn');
const aiLoading = document.getElementById('ai-loading');
const aiResult = document.getElementById('ai-result');
const aiContent = document.getElementById('ai-content');
const learningStyle = document.getElementById('learning-style');

let debounceTimer;
let currentSelectedBook = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) geminiKeyInput.value = savedKey;
});

saveKeyBtn.addEventListener('click', () => {
    const key = geminiKeyInput.value.trim();
    if (key) {
        localStorage.setItem('gemini_api_key', key);
        saveKeyBtn.textContent = 'Saved!';
        saveKeyBtn.classList.remove('bg-slate-800', 'hover:bg-slate-700');
        saveKeyBtn.classList.add('bg-green-600', 'hover:bg-green-700');
        setTimeout(() => {
            saveKeyBtn.textContent = 'Save Key';
            saveKeyBtn.classList.add('bg-slate-800', 'hover:bg-slate-700');
            saveKeyBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
        }, 2000);
    }
});

// Search functionality
searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearTimeout(debounceTimer);
    
    if (query.length < 2) {
        resultsGrid.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                <div class="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100 mb-4">
                    <i class="fas fa-globe text-2xl text-blue-500"></i>
                </div>
                <h3 class="text-lg font-bold text-slate-700 mb-1">Explore the world's books</h3>
                <p class="text-slate-500 max-w-sm">Start typing a title, author, or topic to discover books from Google Books and Open Library.</p>
            </div>
        `;
        return;
    }

    debounceTimer = setTimeout(() => {
        performSearch(query);
    }, 600);
});

async function performSearch(query) {
    searchLoading.classList.remove('hidden');
    resultsGrid.innerHTML = '';
    
    try {
        const [googleBooks, openLibrary] = await Promise.allSettled([
            fetchGoogleBooks(query),
            fetchOpenLibrary(query)
        ]);

        let results = [];
        if (googleBooks.status === 'fulfilled') results = results.concat(googleBooks.value);
        if (openLibrary.status === 'fulfilled') results = results.concat(openLibrary.value);

        // Deduplicate by title & author
        const uniqueResults = [];
        const seen = new Set();
        
        for (const book of results) {
            const key = `${book.title.toLowerCase()}_${book.author.toLowerCase()}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueResults.push(book);
            }
        }

        renderResults(uniqueResults);
    } catch (error) {
        console.error("Search failed", error);
        resultsGrid.innerHTML = `
            <div class="col-span-full bg-red-50 p-6 rounded-2xl text-center border border-red-100 text-red-600">
                <i class="fas fa-exclamation-circle text-2xl mb-2"></i>
                <p class="font-medium">Failed to fetch results. Please try again.</p>
            </div>
        `;
    } finally {
        searchLoading.classList.add('hidden');
    }
}

async function fetchGoogleBooks(query) {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=12`);
    const data = await res.json();
    
    if (!data.items) return [];
    
    return data.items.map(item => {
        const info = item.volumeInfo;
        const isbn = info.industryIdentifiers?.[0]?.identifier || 'N/A';
        const cover = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || '';
        return {
            id: `gb_${item.id}`,
            title: info.title || 'Untitled',
            author: info.authors?.join(', ') || 'Unknown Author',
            coverUrl: cover.replace('http:', 'https:'),
            description: info.description || 'No description available.',
            publishYear: info.publishedDate?.substring(0, 4) || 'N/A',
            isbn: isbn,
            categories: info.categories?.[0] || 'General',
            publisher: info.publisher || 'N/A',
            source: 'Google Books'
        };
    });
}

async function fetchOpenLibrary(query) {
    const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10`);
    const data = await res.json();
    
    if (!data.docs) return [];
    
    return data.docs.map(doc => {
        const coverId = doc.cover_i;
        const coverUrl = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : '';
        return {
            id: `ol_${doc.key.split('/').pop()}`,
            title: doc.title || 'Untitled',
            author: doc.author_name?.join(', ') || 'Unknown Author',
            coverUrl: coverUrl,
            description: 'Public library catalog record.',
            publishYear: doc.first_publish_year?.toString() || 'N/A',
            isbn: doc.isbn?.[0] || 'N/A',
            categories: doc.subject?.[0] || 'General',
            publisher: doc.publisher?.[0] || 'N/A',
            source: 'Open Library'
        };
    });
}

function renderResults(books) {
    if (books.length === 0) {
        resultsGrid.innerHTML = `
            <div class="col-span-full bg-white p-10 rounded-3xl text-center border border-slate-200 shadow-sm">
                <i class="fas fa-search text-4xl text-slate-300 mb-4"></i>
                <h3 class="text-xl font-bold text-slate-700">No live results found.</h3>
                <p class="text-slate-500 mt-2">Try searching full titles or authors.</p>
            </div>
        `;
        return;
    }

    resultsGrid.innerHTML = books.map(book => `
        <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:border-blue-200 transition-all cursor-pointer flex items-center gap-4 group" onclick="openBookModal('${book.id}')">
            ${book.coverUrl 
                ? `<img src="${book.coverUrl}" alt="Cover" class="w-16 h-24 object-cover rounded-lg shadow-sm bg-slate-100 group-hover:scale-105 transition-transform">` 
                : `<div class="w-16 h-24 bg-slate-50 rounded-lg shadow-inner border border-slate-100 flex items-center justify-center text-slate-300 group-hover:bg-slate-100 transition-colors"><i class="fas fa-book text-xl"></i></div>`
            }
            <div class="flex-1 min-w-0 py-1">
                <h3 class="text-base font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">${book.title}</h3>
                <p class="text-sm text-slate-500 truncate mb-2">by ${book.author}</p>
                <div class="flex flex-wrap gap-2 mt-auto">
                    <span class="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-md font-semibold border border-blue-100 flex items-center gap-1"><i class="fas fa-database text-[10px]"></i> ${book.source}</span>
                    ${book.publishYear !== 'N/A' ? `<span class="px-2 py-1 bg-slate-50 text-slate-600 text-xs rounded-md font-medium border border-slate-200">${book.publishYear}</span>` : ''}
                </div>
            </div>
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 group-hover:text-blue-500 group-hover:bg-blue-50 transition-all mr-2">
                <i class="fas fa-chevron-right"></i>
            </div>
        </div>
    `).join('');

    window.currentBooks = books;
}

// Modal Handlers
window.openBookModal = (id) => {
    currentSelectedBook = window.currentBooks.find(b => b.id === id);
    if (!currentSelectedBook) return;

    modalTitle.textContent = currentSelectedBook.title;
    modalAuthor.textContent = `By ${currentSelectedBook.author}`;
    modalYear.textContent = `Year: ${currentSelectedBook.publishYear}`;
    modalIsbn.textContent = `ISBN: ${currentSelectedBook.isbn}`;
    
    if (currentSelectedBook.coverUrl) {
        modalCover.src = currentSelectedBook.coverUrl;
        modalCover.classList.remove('hidden');
    } else {
        modalCover.classList.add('hidden');
    }

    aiResult.classList.add('hidden');
    aiContent.innerHTML = '';
    generateBtn.classList.remove('hidden');

    aiModal.classList.remove('hidden');
    // Prevent body scrolling
    document.body.style.overflow = 'hidden';
};

closeModal.addEventListener('click', () => {
    aiModal.classList.add('hidden');
    document.body.style.overflow = '';
});

// Generate AI Guide
generateBtn.addEventListener('click', async () => {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
        alert('Please enter your Gemini API Key at the top of the page first.');
        // Scroll to top smoothly
        aiModal.classList.add('hidden');
        document.body.style.overflow = '';
        window.scrollTo({ top: 0, behavior: 'smooth' });
        geminiKeyInput.focus();
        return;
    }

    generateBtn.classList.add('hidden');
    aiLoading.classList.remove('hidden');
    aiResult.classList.add('hidden');

    try {
        const prompt = `
            Analyze the following book and create a structured study guide / knowledge base.
            
            Title: "${currentSelectedBook.title}"
            Author: "${currentSelectedBook.author}"
            Subject: "${currentSelectedBook.categories}"
            Target Learning Style: "${learningStyle.value}"
            Retrieved Description: "${currentSelectedBook.description}"

            Provide a comprehensive, well-structured markdown summary of the book's core concepts, target audience, key takeaways, and a structured study plan tailored to the requested learning style. Use headings, bullet points, and bold text for readability. Do not wrap in a markdown code block, just output the raw markdown.
        `;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }]
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (textResponse) {
            aiContent.innerHTML = marked.parse(textResponse);
            aiResult.classList.remove('hidden');
        } else {
            throw new Error('Invalid response from AI');
        }

    } catch (error) {
        console.error("AI Generation failed", error);
        aiContent.innerHTML = `
            <div class="bg-red-50 p-4 rounded-xl border border-red-100 text-red-600 flex items-start gap-3">
                <i class="fas fa-exclamation-triangle mt-1"></i>
                <div>
                    <p class="font-bold">Failed to generate guide.</p>
                    <p class="text-sm mt-1">Please ensure your Gemini API key is correct and you have an active internet connection. Check the console for more details.</p>
                </div>
            </div>
        `;
        aiResult.classList.remove('hidden');
        generateBtn.classList.remove('hidden');
        generateBtn.innerHTML = '<i class="fas fa-redo"></i> Try Again';
    } finally {
        aiLoading.classList.add('hidden');
    }
});
