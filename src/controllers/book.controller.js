// POST /books → Add a book (Admin only)
// GET /books → List all books (public, supports filters)
// GET /books/:id → Get book details
// PUT /books/:id → Update book (Admin only)
// DELETE /books/:id → Delete book (Admin only)

import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { db } from "../utils/db.js";
import { ApiResponse } from "../utils/api-response.js";


//TODO: write validators for it 
//write middlewares for it 
export const createBook = asyncHandler(async(req, res) => {
    const {
        title,
        author,
        description,
        price,
        stock,
        publishedAt,
        category
    } = req.body;

    const new_book = await db.book.create({
        data: {
            title,
            author,
            description,
            price,
            stock,
            publishedAt,
            category,
            sellerId: req.user.id,
        }
    });

    if(!new_book) throw new ApiError(500, "Error while listing this book");

    return res.status(200).json(new ApiResponse(200, new_book, "Book listed successfully!"));
})

export const getBookById = asyncHandler( async(req, res) => {
    const {bookId} = req.params;

    const book = await db.book.findUnique({
        where: { id: bookId }
    })

    if(!book) throw new ApiError(404,"Book not found");

    return res.status(200).json(new ApiResponse(200, book, "Book details fetched successfully!"));
})

export const getBooks = asyncHandler( async(req, res) => {
    //indexing and paging
})

export const updateBook = asyncHandler(async(req, res) => {

})

export const deleteBook = asyncHandler(async(req, res) => {

})

export const getBookByAuthor = asyncHandler(async(req, res) => {

})

export const getBookByCategory = asyncHandler(async(req, res) => {

})

export const getBookByPrice = asyncHandler(async(req, res) => {

})

export const getBookbyRatings = asyncHandler(async(req, res) => {
    
})