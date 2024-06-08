import { validate } from "../validation/validation.js";
import { prismaClient } from "../application/database.js";
import { ResponseError } from "../error/response-error.js";
import { v4 as uuid } from "uuid";
import axios from "axios";
import { checkoutOrderValidation } from "../validation/order-validation.js";

import path from "path";
import ejs from "ejs";
import puppeteer from "puppeteer";

const get = async (req, res, next) => {
	try {
		const order = await prismaClient.order.findUnique({
			where: {
				id: req.params.id,
			},
			include: {
				items: {
					include: {
						product: true,
					},
				},
			},
		});

		if (!order) {
			throw new ResponseError(404, "Order not found");
		}

		res.status(200).json({
			data: order,
		});
	} catch (e) {
		next(e);
	}
};

const getCart = async (req, res, next) => {
	try {
		const order = await prismaClient.order.findUnique({
			where: {
				userId: req.user.id,
				isCheckedOut: null,
			},
			include: {
				items: {
					include: {
						product: true,
					},
				},
			},
		});

		if (!order) {
			throw new ResponseError(404, "Order not found");
		}

		res.status(200).json({
			data: order,
		});
	} catch (e) {
		next(e);
	}
};

const checkout = async (req, res, next) => {
	try {
		const { customerName, customerPhone, customerAddress } = validate(checkoutOrderValidation, req.body);
		const order = await prismaClient.order.findUnique({
			where: {
				userId: req.user.id,
				isCheckedOut: null,
			},
		});

		if (!order) {
			throw new ResponseError(404, "Order not found");
		}

		const orderItems = await prismaClient.orderItem.findMany({
			where: {
				orderId: order.id,
			},
		});

		if (orderItems.length === 0) {
			throw new ResponseError(400, "Order is empty");
		}

		// set stock of product
		for (const orderItem of orderItems) {
			let product = await prismaClient.product.findUnique({
				where: { id: orderItem.productId },
			});

			if (product.stock < orderItem.quantity) {
				throw new ResponseError(400, "Stock is not enough");
			}

			product = await prismaClient.product.update({
				where: { id: orderItem.productId },
				data: {
					stock: product.stock - orderItem.quantity,
				},
			});

			// if stock is less than minimum stock, send notification to supplier and admin
			if (product.stock < product.minStock) {
				// send notification to supplier
				const supplier = await prismaClient.supplier.findUnique({
					where: { id: product.supplierId },
				});

				const FONNTE_TOKEN = "iCijKRQKHrpbGKfUhZ+1";

				const supplierWhatsapp = supplier.whatsapp;
				const messageSupplier = `Stok produk *${product.name}* kurang dari stok minimum. Segera lakukan pengecekan dan penambahan stok produk.`;
				// send whatsapp message to supplier using axios
				await axios.post(
					"https://api.fonnte.com/send",
					{
						message: messageSupplier,
						target: supplierWhatsapp,
					},
					{
						headers: {
							Authorization: FONNTE_TOKEN,
							"Content-Type": "application/x-www-form-urlencoded",
						},
					}
				);

				// send notification to admin
				const adminWhatsapp = req.user.whatsapp;
				const messageAdmin = `Stok produk ${product.name} kurang dari stok minimum. Segera lakukan pengecekan dan penambahan stok produk.`;
				// send whatsapp message to admin using axios
				await axios.post(
					"https://api.fonnte.com/send",
					{
						message: messageAdmin,
						target: adminWhatsapp,
					},
					{
						headers: {
							Authorization: FONNTE_TOKEN,
							"Content-Type": "application/x-www-form-urlencoded",
						},
					}
				);
			}
		}

		await prismaClient.order.update({
			where: {
				id: order.id,
			},
			data: {
				isCheckedOut: new Date(),
				customerName: customerName,
				customerPhone: customerPhone,
				customerAddress: customerAddress,
			},
		});

		res.status(200).json({
			message: "Order checked out",
		});
	} catch (e) {
		next(e);
	}
};

const getMany = async (req, res, next) => {
	try {
		const orders = await prismaClient.order.findMany({
			where: {
				userId: req.user.id,
				isCheckedOut: {
					not: null,
				},
			},
			orderBy: {
				isCheckedOut: "desc",
			},
		});

		res.status(200).json({
			data: orders,
		});
	} catch (e) {
		next(e);
	}
};

const generatePDF = async (req, res, next) => {
	try {
		const { month, year } = req.query;

		// Memfilter order berdasarkan bulan dan tahun jika diberikan
		const orders = await prismaClient.order.findMany({
			where: {
				userId: req.user.id,
				...(month &&
					year && {
						createdAt: {
							gte: new Date(year, month - 1, 1),
							lt: new Date(year, month, 1),
						},
					}),
			},
			include: {
				items: {
					include: {
						product: true,
					},
				},
				user: true,
			},
			orderBy: {
				isCheckedOut: "desc",
			},
		});

		// format date to  DD/MM/YYYY
		// orders.forEach((order) => {
		// 	order.isCheckedOut = order.isCheckedOut.toLocaleTimeString("id-ID", {
		// 		day: "2-digit",
		// 		month: "2-digit",
		// 		year: "numeric",
		// 	});
		// });

		// Menghitung jumlah order
		let totalOrders = orders.length;

		// Jika tidak ada order, kirimkan response kosong
		if (totalOrders === 0) {
			throw new ResponseError(404, "No order found");
		}

		// total order price
		let totalPrice = 0;
		orders.forEach((order) => {
			totalPrice += order.totalPrice;
		});

		// Merender template report.ejs
		const html = await ejs.renderFile(
			path.resolve("src/views/report.ejs"),
			{
				orders: orders,
				totalOrders: totalOrders,
				month: month,
				year: year,
			},
			{ async: true }
		);

		// Meluncurkan browser Puppeteer
		const browser = await puppeteer.launch({
			args: ["--no-sandbox", "--disable-setuid-sandbox"], // Tambahan opsi untuk lingkungan tertentu
		});
		const page = await browser.newPage();
		await page.setContent(html, { waitUntil: "networkidle0" }); // Tunggu hingga halaman benar-benar dimuat

		// Menghasilkan PDF
		const pdfBuffer = await page.pdf({
			format: "A4",
			margin: {
				top: "5mm",
				right: "5mm",
				bottom: "5mm",
				left: "5mm",
			},
		});

		// Menutup browser
		await browser.close();

		// Mengirimkan PDF sebagai response
		res.set("Content-Type", "application/pdf");
		res.send(pdfBuffer);
	} catch (e) {
		next(e);
	}
};

export default { get, checkout, getMany, generatePDF, getCart };
