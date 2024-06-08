import express from "express";
import userController from "../controller/user-controller.js";
import productController from "../controller/product-controller.js";
import supplierController from "../controller/supplier-controller.js";
import { authMiddleware } from "../middleware/auth-middleware.js";
import orderitemController from "../controller/orderitem-controller.js";
import orderController from "../controller/order-controller.js";
import multer from "multer";

// Multer
const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, "public/images");
	},
	filename: function (req, file, cb) {
		const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
		cb(null, uniqueSuffix + "-" + file.originalname);
	},
});

const upload = multer({ storage: storage });

const userRouter = new express.Router();
userRouter.use(authMiddleware);

// User API
userRouter.get("/api/users/current", userController.get);
userRouter.patch("/api/users/current", userController.update);
userRouter.delete("/api/users/logout", userController.logout);

// Product API
userRouter.get("/api/products", productController.getMany);
userRouter.get("/api/products/:id", productController.get);
userRouter.post("/api/products", upload.single("image"), productController.create);
userRouter.patch("/api/products/:id", upload.single("image"), productController.update);
userRouter.delete("/api/products/:id", productController.destroy);

// Supplier API
userRouter.get("/api/suppliers", supplierController.getMany);
userRouter.get("/api/suppliers/:id", supplierController.get);
userRouter.post("/api/suppliers", supplierController.create);
userRouter.patch("/api/suppliers/:id", supplierController.update);
userRouter.delete("/api/suppliers/:id", supplierController.destroy);

// Order Item API
userRouter.post("/api/orderitems", orderitemController.create);

// Order API
userRouter.get("/api/orders/report", orderController.generatePDF);
userRouter.get("/api/orders/cart", orderController.getCart);
userRouter.get("/api/orders/:id", orderController.get);
userRouter.get("/api/orders", orderController.getMany);
userRouter.post("/api/orders/checkout", orderController.checkout);

export { userRouter };
