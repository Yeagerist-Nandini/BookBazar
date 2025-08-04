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
            category
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


// curosr pagination & filtering
export const getBooks = asyncHandler( async(req, res) => {
    let {
        limit = 10, 
        cursor, // last book id from previous page
        search,
        categoryId,
        minPrice = 0,
        maxPrice, 
        sortBy = "createdAt", // or price, publishedAt
        sortOrder = "desc"
    } = req.query;

    limit = Number(limit);

    const filters = {
        ...(search && {
            OR: [
                {title: {contains: search, mode: "insensitive"}},
                {author: {contains: search, mode: "insensitive"}}
            ]
        }),
        ...(category && {
            category: {some: {id: categoryId}}
        }),
        ...(minPrice && {price: {gte: Number(minPrice)}}),
        ...(maxPrice && {price: {lte: Number(maxPrice)}})
    };

    const paginationOptions = cursor ? {
        skip: 1,
        cursor: {id: cursor}
    }: {};

    const books = await db.book.findMany({
        where: filters,
        take: limit,
        orderBy: {[sortBy]: sortOrder},
        ...paginationOptions,
        include: {
            category: true,
            review: true
        },
        select: {
            title: true,
            price: true,
            author: true
        }
    });

    const nextCursor = books.length === limit ? books[books.length-1].id : null;

    return res
            .status(200)
            .json(new ApiResponse(200, {
                books,
                nextCursor
            }, "Books fetched successfully"));
})

export const updateBook = asyncHandler(async(req, res) => {
    const { bookId } = req.params;

    const {
        title,
        author,
        description,
        price,
        stock,
        publishedAt,
        category
    } = req.body;

    const updated_book = await db.book.update({
        where: { id: bookId},
        data: {
            title,
            author,
            description,
            price,
            stock,
            publishedAt,
            category
        }
    });

    if(!updated_book) throw new ApiError(500, "Error while listing this book");

    return res
            .status(200)
            .json(new ApiResponse(200, updated_book, "Book updated successfully!")); 
})

export const deleteBook = asyncHandler(async(req, res) => {
    const { bookId } = req.params;

    const deletedBook = await db.book.delete({
        where: { id: bookId }, //only unique fields
    });

    if(!deletedBook){
        throw new ApiError(500, "Error while deleting book");
    }

    return res
            .status(200)
            .json(new ApiResponse(200, deletedBook, "Book deleted successfully!")); 
})

export const getBookbyRatings = asyncHandler(async(req, res) => {
    
})


// Input validation – Use Zod/Joi/Yup for req.body and req.params.

// Relation handling – Use connect for category/author relations.

// Selective fields – Use select for lighter responses in lists.

// Sorting options – Allow sorting by price, date, popularity.

// Caching – Use Redis for frequently accessed book lists.

// Logging – Log errors and DB operations for debugging.



// Frontend first request:

// pgsql
// Copy
// Edit
// GET /books?limit=10&sortBy=createdAt&sortOrder=desc
// → Returns 10 newest books + nextCursor = last book’s ID.

// Frontend next page request:

// pgsql
// Copy
// Edit
// GET /books?limit=10&cursor=<lastBookIdFromPreviousPage>