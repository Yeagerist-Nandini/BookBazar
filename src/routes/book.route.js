import { Router } from "express";
import { isAdmin, isLoggedIn } from "../middlewares/auth.middleware.js";
import {
    createBook,
    getBookById,
    getBooks,
    updateBook,
    deleteBook,
} from '../controllers/book.controller.js'

const router = Router();

router.get("/books", isLoggedIn, getBooks);
router.get("/books/:bookId", isLoggedIn, getBookById);

router.post("/create-book", isLoggedIn, isAdmin, createBook);
router.delete("/books/:bookId", isLoggedIn, isAdmin, deleteBook);
router.put("/books/:bookId", isLoggedIn, isAdmin, updateBook);

export default router