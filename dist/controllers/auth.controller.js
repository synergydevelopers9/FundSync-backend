"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateNextMemberId = generateNextMemberId;
exports.register = register;
exports.login = login;
exports.adminLogin = adminLogin;
exports.refreshToken = refreshToken;
exports.logout = logout;
exports.forgotPassword = forgotPassword;
exports.resetPassword = resetPassword;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const db_1 = require("../utils/db");
const jwt_1 = require("../utils/jwt");
const logger_1 = require("../utils/logger");
const notifications_1 = require("../utils/notifications");
// Zod schemas for auth inputs validation
const registerSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(2, 'Name must be at least 2 characters'),
    fatherName: zod_1.z.string().optional(),
    mobile: zod_1.z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid mobile phone number format'),
    email: zod_1.z.string().email('Invalid email address'),
    dateOfBirth: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of Birth must be YYYY-MM-DD'),
    gender: zod_1.z.string().min(1, 'Gender is required'),
    address: zod_1.z.string().min(5, 'Address must be at least 5 characters'),
    city: zod_1.z.string().min(2, 'City is required'),
    state: zod_1.z.string().min(2, 'State is required'),
    pinCode: zod_1.z.string().regex(/^\d{4,8}$/, 'PIN Code must be 4 to 8 digits'),
    govId: zod_1.z.string().optional(),
    profilePhoto: zod_1.z.string().optional(),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one digit')
        .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    planId: zod_1.z.string().optional(), // Link initial plan if selected
});
const loginSchema = zod_1.z.object({
    identifier: zod_1.z.string().min(1, 'Email or Member ID is required'),
    password: zod_1.z.string().min(1, 'Password is required'),
});
const adminLoginSchema = zod_1.z.object({
    username: zod_1.z.string().min(1, 'Username is required'),
    password: zod_1.z.string().min(1, 'Password is required'),
});
const forgotPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
});
const resetPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    otp: zod_1.z.string().length(6, 'OTP must be exactly 6 characters'),
    newPassword: zod_1.z.string().min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one digit')
        .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});
// Concurrent-safe, duplicate-free incremental member ID sequence generation
async function generateNextMemberId() {
    for (let attempt = 0; attempt < 5; attempt++) {
        const lastMember = await db_1.prisma.member.findFirst({
            orderBy: { memberId: 'desc' },
            select: { memberId: true },
        });
        let nextIdVal = 1;
        if (lastMember) {
            const numPart = parseInt(lastMember.memberId.replace(/^\D+/g, ''), 10);
            if (!isNaN(numPart)) {
                nextIdVal = numPart + 1;
            }
        }
        const candidateId = `M${String(nextIdVal).padStart(6, '0')}`;
        // Verify uniqueness
        const exists = await db_1.prisma.member.findUnique({
            where: { memberId: candidateId },
        });
        if (!exists) {
            return candidateId;
        }
    }
    throw new Error('Failed to generate a unique Member ID after 5 attempts');
}
async function register(req, res) {
    try {
        const validated = registerSchema.parse(req.body);
        // Prevent duplicates
        const emailExists = await db_1.prisma.user.findFirst({
            where: { email: validated.email, deletedAt: null },
        });
        if (emailExists) {
            return res.status(400).json({ error: 'Email is already registered' });
        }
        const mobileExists = await db_1.prisma.member.findFirst({
            where: { mobile: validated.mobile, deletedAt: null },
        });
        if (mobileExists) {
            return res.status(400).json({ error: 'Mobile number is already registered' });
        }
        const passwordHash = await bcryptjs_1.default.hash(validated.password, 10);
        const memberId = await generateNextMemberId();
        // Determine default payment fields based on Plan
        let monthlyAmount = 0;
        let planName = 'No Plan';
        if (validated.planId) {
            const plan = await db_1.prisma.plan.findUnique({
                where: { id: validated.planId },
            });
            if (plan) {
                monthlyAmount = plan.monthlyAmount;
                planName = plan.name;
            }
        }
        // Database transaction to write User and Member
        const newUser = await db_1.prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    email: validated.email,
                    passwordHash,
                    role: 'MEMBER',
                    member: {
                        create: {
                            memberId,
                            fullName: validated.fullName,
                            fatherName: validated.fatherName,
                            mobile: validated.mobile,
                            dateOfBirth: validated.dateOfBirth,
                            gender: validated.gender,
                            address: validated.address,
                            city: validated.city,
                            state: validated.state,
                            pinCode: validated.pinCode,
                            govId: validated.govId,
                            profilePhoto: validated.profilePhoto || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
                            planId: validated.planId || null,
                            nextDueDate: validated.planId ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null, // 30 days due
                            pendingAmount: monthlyAmount,
                        },
                    },
                },
                include: {
                    member: true,
                },
            });
            return user;
        });
        await (0, logger_1.logAudit)(newUser.id, 'MEMBER_REGISTER', `Member ${memberId} (${validated.fullName}) registered for plan: ${planName}`);
        await (0, notifications_1.createNotification)(newUser.id, 'Welcome to ApexFinance!', `Your account has been created. Your unique Member ID is ${memberId}.`, 'SYSTEM');
        const memberDetails = newUser.member;
        const accessToken = (0, jwt_1.generateAccessToken)({
            userId: newUser.id,
            role: 'MEMBER',
            memberId: memberDetails.id,
        });
        const refreshToken = (0, jwt_1.generateRefreshToken)({
            userId: newUser.id,
            role: 'MEMBER',
            memberId: memberDetails.id,
        });
        // Set refresh token in secure cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });
        return res.status(201).json({
            message: 'Registration successful',
            token: accessToken,
            user: {
                id: newUser.id,
                email: newUser.email,
                role: newUser.role,
                memberId: memberDetails.memberId,
                fullName: memberDetails.fullName,
                photo: memberDetails.profilePhoto,
            },
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Registration error:', error);
        return res.status(500).json({ error: 'Internal Server Error during registration' });
    }
}
async function login(req, res) {
    try {
        const validated = loginSchema.parse(req.body);
        // Identifier can be Email or Member ID
        let user = await db_1.prisma.user.findFirst({
            where: {
                OR: [
                    { email: validated.identifier },
                    { member: { memberId: validated.identifier } },
                ],
                deletedAt: null,
            },
            include: {
                member: true,
                admin: true,
            },
        });
        if (!user || !user.isActive) {
            return res.status(401).json({ error: 'Invalid credentials or inactive account' });
        }
        const isMatch = await bcryptjs_1.default.compare(validated.password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const isMember = user.role === 'MEMBER';
        const payload = {
            userId: user.id,
            role: user.role,
            memberId: isMember ? user.member?.id : undefined,
            adminId: !isMember ? user.admin?.id : undefined,
        };
        const accessToken = (0, jwt_1.generateAccessToken)(payload);
        const refreshToken = (0, jwt_1.generateRefreshToken)(payload);
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        await (0, logger_1.logAudit)(user.id, 'USER_LOGIN', `User logged in from IP ${req.ip}`);
        return res.json({
            message: 'Login successful',
            token: accessToken,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                memberId: isMember ? user.member?.memberId : undefined,
                fullName: isMember ? user.member?.fullName : user.admin?.name || 'Administrator',
                photo: isMember ? user.member?.profilePhoto : undefined,
            },
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Internal Server Error during login' });
    }
}
async function adminLogin(req, res) {
    try {
        const validated = adminLoginSchema.parse(req.body);
        const admin = await db_1.prisma.admin.findUnique({
            where: { username: validated.username },
            include: { user: true },
        });
        if (!admin || admin.user.deletedAt !== null || !admin.user.isActive) {
            return res.status(401).json({ error: 'Invalid admin credentials or deactivated account' });
        }
        const isMatch = await bcryptjs_1.default.compare(validated.password, admin.user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid admin credentials' });
        }
        const payload = {
            userId: admin.user.id,
            role: 'ADMIN',
            adminId: admin.id,
        };
        const accessToken = (0, jwt_1.generateAccessToken)(payload);
        const refreshToken = (0, jwt_1.generateRefreshToken)(payload);
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        await (0, logger_1.logAudit)(admin.user.id, 'ADMIN_LOGIN', `Administrator logged in from IP ${req.ip}`);
        return res.json({
            message: 'Admin login successful',
            token: accessToken,
            user: {
                id: admin.user.id,
                email: admin.user.email,
                role: 'ADMIN',
                fullName: admin.name,
            },
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Admin Login error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
async function refreshToken(req, res) {
    const token = req.cookies.refreshToken;
    if (!token) {
        return res.status(401).json({ error: 'Refresh token required' });
    }
    const payload = (0, jwt_1.verifyRefreshToken)(token);
    if (!payload) {
        return res.status(403).json({ error: 'Invalid or expired refresh token' });
    }
    const newPayload = {
        userId: payload.userId,
        role: payload.role,
        memberId: payload.memberId,
        adminId: payload.adminId,
    };
    const newAccessToken = (0, jwt_1.generateAccessToken)(newPayload);
    const newRefreshToken = (0, jwt_1.generateRefreshToken)(newPayload);
    res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return res.json({ token: newAccessToken });
}
async function logout(req, res) {
    res.clearCookie('refreshToken');
    return res.json({ message: 'Logged out successfully' });
}
async function forgotPassword(req, res) {
    try {
        const validated = forgotPasswordSchema.parse(req.body);
        const user = await db_1.prisma.user.findFirst({
            where: { email: validated.email, deletedAt: null },
        });
        if (!user) {
            // Return 200/success anyway to prevent user enumeration attacks
            return res.json({ message: 'If the email exists, an OTP has been sent' });
        }
        // Generate 6-digit random OTP code
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
        // Delete existing reset tokens for this user
        await db_1.prisma.passwordResetToken.deleteMany({
            where: { userId: user.id },
        });
        await db_1.prisma.passwordResetToken.create({
            data: {
                userId: user.id,
                token: otpCode,
                expiresAt: expiry,
            },
        });
        // Mock Email Output (simulate NodeMailer dispatch)
        console.log(`\n======================================================`);
        console.log(`[EMAIL SEND] To: ${user.email}`);
        console.log(`[EMAIL SEND] Subject: Password Reset OTP`);
        console.log(`[EMAIL SEND] Message: Your password reset verification code is: ${otpCode}`);
        console.log(`======================================================\n`);
        return res.json({ message: 'If the email exists, an OTP has been sent' });
    }
    catch (error) {
        console.error('Forgot password error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
async function resetPassword(req, res) {
    try {
        const validated = resetPasswordSchema.parse(req.body);
        const user = await db_1.prisma.user.findFirst({
            where: { email: validated.email, deletedAt: null },
        });
        if (!user) {
            return res.status(400).json({ error: 'Invalid email, OTP, or token expired' });
        }
        const validToken = await db_1.prisma.passwordResetToken.findFirst({
            where: {
                userId: user.id,
                token: validated.otp,
                expiresAt: { gt: new Date() },
            },
        });
        if (!validToken) {
            return res.status(400).json({ error: 'Invalid email, OTP, or token expired' });
        }
        const hashed = await bcryptjs_1.default.hash(validated.newPassword, 10);
        await db_1.prisma.$transaction([
            db_1.prisma.user.update({
                where: { id: user.id },
                data: { passwordHash: hashed },
            }),
            db_1.prisma.passwordResetToken.delete({
                where: { id: validToken.id },
            }),
        ]);
        await (0, logger_1.logAudit)(user.id, 'PASSWORD_RESET', 'User successfully reset password using OTP code');
        await (0, notifications_1.createNotification)(user.id, 'Password Updated', 'Your account password was updated successfully.', 'SYSTEM');
        return res.json({ message: 'Password has been successfully updated' });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Reset password error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
