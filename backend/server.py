from fastapi import FastAPI, APIRouter, HTTPException, Query, Depends, status, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
import asyncio
from datetime import datetime, date, timedelta
import json
import csv
import io
from passlib.context import CryptContext
import jwt
from jwt import PyJWTError
import secrets
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import boto3
from botocore.exceptions import NoCredentialsError

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', secrets.token_urlsafe(32))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 hours - reasonable work session

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# HTTP Bearer for JWT
security = HTTPBearer()

# Authentication helpers
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def generate_random_password(length: int = 8) -> str:
    """Generate a random password"""
    import random
    import string
    characters = string.ascii_letters + string.digits
    return ''.join(random.choice(characters) for _ in range(length))

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Define Models
class Room(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    room_number: str
    room_type: str  # Suite, Double, Triple
    status: str  # Available, Occupied, Reserved
    current_guest: Optional[str] = None
    check_in_date: Optional[date] = None
    check_out_date: Optional[date] = None
    price_per_night: float = 0.0
    max_occupancy: int = 2
    amenities: List[str] = []
    image_url: str = "https://images.unsplash.com/photo-1568495248636-6432b97bd949?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzR8MHwxfHNlYXJjaHwyfHxob3RlbCUyMHJvb218ZW58MHx8fHwxNzUyMjU1NjAxfDA&ixlib=rb-4.1.0&q=85"
    created_at: datetime = Field(default_factory=datetime.utcnow)

class RoomCreate(BaseModel):
    room_number: str
    room_type: str
    price_per_night: float
    max_occupancy: int = 2
    amenities: List[str] = []

class BulkRoomCreate(BaseModel):
    """Model for creating multiple rooms at once"""
    room_prefix: str  # e.g., "1" for 101, 102, etc.
    start_number: int  # e.g., 1 for x01
    end_number: int    # e.g., 10 for x10
    room_type: str
    price_per_night: float
    max_occupancy: int = 2
    amenities: List[str] = []

class CleaningStaff(BaseModel):
    """Model for cleaning staff"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: str = ""
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class CleaningAssignment(BaseModel):
    """Model for room cleaning assignment"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    room_number: str
    staff_id: str
    staff_name: str
    assigned_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    status: str = "Assigned"  # Assigned, Completed
    previous_guest: str = ""

class Booking(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    guest_name: str
    guest_email: str = ""
    guest_phone: str = ""
    guest_id_passport: str = ""
    guest_country: str = ""
    guest_id_proof: str = ""  # Base64 encoded PDF
    guest_id_proof_filename: str = ""
    room_number: str
    check_in_date: date
    check_out_date: date
    stay_type: str = "Night Stay"  # "Night Stay" or "Short Time"
    booking_amount: float = 0.0  # Custom amount entered by user
    advance_amount: float = 0.0  # Advance payment at booking time
    advance_payment_method: str = "Cash"
    commission_amount: float = 0.0  # Commission payable to booking channel
    booking_channel_id: str = ""  # ID of the booking channel
    booking_channel_name: str = "Direct"  # Name of the booking channel for display
    status: str  # Upcoming, Checked-in, Completed, Cancelled
    additional_notes: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)

class BookingChannel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    channel_name: str  # e.g., "Booking.com", "Expedia", "Direct", "Agoda"
    channel_type: str = "OTA"  # OTA (Online Travel Agency), Direct, Corporate, Walk-in
    commission_rate: float = 0.0  # Percentage commission (e.g., 15.5 for 15.5%)
    auto_rate: bool = True  # Auto-calculate commission from percentage
    contact_email: str = ""
    contact_phone: str = ""
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str = "Admin"

class BookingChannelCreate(BaseModel):
    channel_name: str
    channel_type: str = "OTA"
    commission_rate: float = 0.0
    auto_rate: bool = True
    contact_email: str = ""
    contact_phone: str = ""

class BookingChannelUpdate(BaseModel):
    channel_name: Optional[str] = None
    channel_type: Optional[str] = None
    commission_rate: Optional[float] = None
    auto_rate: Optional[bool] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    is_active: Optional[bool] = None

class BookingCreate(BaseModel):
    guest_name: str
    guest_email: str = ""
    guest_phone: str = ""
    guest_id_passport: str = ""
    guest_country: str = ""
    guest_id_proof: str = ""  # Base64 encoded PDF
    guest_id_proof_filename: str = ""  # Original filename
    room_number: str
    check_in_date: date
    check_out_date: Optional[date] = None
    stay_type: str = "Night Stay"
    booking_amount: float = 0.0
    advance_amount: float = 0.0  # Advance payment at booking time
    advance_payment_method: str = "Cash"
    commission_amount: float = 0.0  # Commission payable to booking channel
    booking_channel_id: str = ""  # ID of the booking channel
    booking_channel_name: str = "Direct"  # Name of the booking channel for display
    additional_notes: str = ""
    booking_status: str = "Upcoming"  # "Upcoming" or "Checked In" - for past date bookings

class BookingUpdate(BaseModel):
    room_number: Optional[str] = None
    check_in_date: Optional[date] = None
    check_out_date: Optional[date] = None
    additional_notes: Optional[str] = None

class Customer(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: str
    phone: str
    current_room: str
    check_in_date: date
    check_out_date: date  # Planned checkout date from booking
    advance_amount: float = 0.0
    notes: str = ""
    room_charges: float = 0.0
    restaurant_charges: float = 0.0  # Added for restaurant integration
    additional_charges: float = 0.0
    total_amount: float = 0.0
    is_checked_out: bool = False  # True when customer has checked out
    actual_checkout_date: Optional[date] = None  # Actual checkout date when checked out
    created_at: datetime = Field(default_factory=datetime.utcnow)

class CheckoutRequest(BaseModel):
    customer_id: str
    additional_amount: float = 0.0
    discount_amount: float = 0.0
    payment_method: str = "Cash"  # Cash, Card, Bank Transfer

class AdvancePaymentRequest(BaseModel):
    customer_id: str
    amount: float
    payment_method: str = "Cash"  # Cash, Card, Bank Transfer
    notes: str = ""

class ExtendStayRequest(BaseModel):
    customer_id: str
    new_checkout_date: date
    
class EarlyCheckoutRequest(BaseModel):
    customer_id: str
    additional_amount: float = 0.0
    discount_amount: float = 0.0
    payment_method: str = "Cash"
    refund_excess: bool = True  # Always refund if applicable
    final_balance: float = 0.0  # Positive = collection needed, Negative = refund needed
    collection_amount: float = 0.0  # Amount collected from customer
    refund_amount: float = 0.0  # Amount refunded to customer

class DailySale(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: date
    customer_name: str
    room_number: str
    room_charges: float
    additional_charges: float
    discount_amount: float
    advance_amount: float
    total_amount: float
    payment_method: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class CheckinRequest(BaseModel):
    booking_id: str
    advance_amount: float = 0.0
    notes: str = ""
    payment_method: str = "Cash"
    new_room_number: Optional[str] = None  # Optional room change during checkin

class Expense(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    description: str
    amount: float
    category: str
    payment_method: str = "Cash"  # Cash, Card, Bank Transfer, Add to Account
    vendor: str = ""
    payment_status: str = "Paid"  # Paid, Pending
    expense_date: date
    created_by: str = "Admin"
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ExpenseCreate(BaseModel):
    description: str
    amount: float
    category: str
    payment_method: str = "Cash"  # Cash, Card, Bank Transfer, Add to Account
    vendor: str = ""
    expense_date: date

class Income(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    description: str
    amount: float
    category: str  # Restaurant, Events, Laundry, Spa, Other Services, etc.
    payment_method: str = "Cash"  # Cash, Card, Bank Transfer
    income_date: date
    guest_name: str = ""  # Associated guest name if applicable
    created_by: str = "Admin"
    created_at: datetime = Field(default_factory=datetime.utcnow)

class IncomeCreate(BaseModel):
    description: str
    amount: float
    category: str
    payment_method: str = "Cash"  # Cash, Card, Bank Transfer
    income_date: date
    guest_name: str = ""  # Associated guest name if applicable

class FinancialSummary(BaseModel):
    total_revenue: float
    total_expenses: float
    net_profit: float
    revenue_breakdown: dict
    expense_breakdown: dict
    period_start: date
    period_end: date

# Available pages for role-based access control
AVAILABLE_PAGES = [
    "dashboard", "calendar", "restaurant", "rooms", "guests", "bookings",
    "income_expense", "expenses", "stocks", "commissions", "reports",
    "payroll", "maintenance", "settings", "feedback"
]

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    password_hash: str  # Hashed password
    full_name: str
    role: str = "Staff"  # Admin, Manager, Staff, Restaurant Manager
    email: str  # Required for password recovery
    is_active: bool = True
    page_permissions: List[str] = []  # List of allowed pages - empty means all (for Admin)
    must_change_password: bool = False  # Force password change on next login
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_login: Optional[datetime] = None

class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    role: str = "Staff"
    email: str  # Required
    page_permissions: List[str] = []

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: str
    username: str
    full_name: str
    role: str
    email: str
    is_active: bool
    page_permissions: List[str] = []
    must_change_password: bool = False
    created_at: datetime
    last_login: Optional[datetime] = None

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

class PasswordResetRequest(BaseModel):
    email: str

class PasswordResetVerify(BaseModel):
    email: str
    otp: str
    new_password: str

class OTPRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    otp: str
    expires_at: datetime
    used: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class SetupWizard(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    is_completed: bool = False
    hotel_name: str = ""
    hotel_address: str = ""
    hotel_email: str = ""
    timezone: str = "UTC"
    cash_balance: float = 0.0  # Initial cash balance
    bank_balance: float = 0.0  # Initial bank balance
    admin_created: bool = False
    completed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class SetupWizardRequest(BaseModel):
    hotel_name: str
    hotel_address: str
    hotel_email: str
    timezone: str = "UTC"  # Timezone for the hotel (e.g., "Asia/Colombo", "America/New_York")
    cash_balance: float = 0.0  # Initial cash balance
    bank_balance: float = 0.0  # Initial bank balance

class EmailSettings(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    provider: str = "smtp"  # smtp, sendgrid, ses, brevo
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    sendgrid_api_key: str = ""
    aws_access_key: str = ""
    aws_secret_key: str = ""
    aws_region: str = "us-east-1"
    # Brevo settings
    brevo_api_key: str = ""
    from_email: str = ""
    from_name: str = ""
    is_configured: bool = False
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class EmailSettingsUpdate(BaseModel):
    provider: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    sendgrid_api_key: Optional[str] = None
    aws_access_key: Optional[str] = None
    aws_secret_key: Optional[str] = None
    aws_region: Optional[str] = None
    brevo_api_key: Optional[str] = None
    from_email: Optional[str] = None
    from_name: Optional[str] = None

class PayrollSettings(BaseModel):
    """Payroll configuration settings"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    epf_employee_rate: float = 8  # Employee EPF contribution %
    epf_employer_rate: float = 12  # Employer EPF contribution %
    etf_rate: float = 3  # ETF contribution %
    enable_epf: bool = True
    enable_etf: bool = True
    tax_enabled: bool = False
    tax_rate: float = 0
    custom_taxes: List[dict] = []  # [{name, rate, type}]
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class TaxConfig(BaseModel):
    """Customizable tax/levy configuration for hotel bookings and restaurant bills"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # e.g., "Service Tax", "Tourism Levy", "VAT", "NBT"
    rate: float  # Percentage or fixed amount
    type: str = "percentage"  # percentage or fixed
    apply_to_bookings: bool = True  # Apply to room bookings/checkout
    apply_to_restaurant: bool = False  # Apply to restaurant bills
    is_active: bool = True
    description: str = ""  # Optional description
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ForgotPasswordRequest(BaseModel):
    username_or_email: str

# Restaurant Management Models
class MenuCategory(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    display_order: int = 0
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class MenuCategoryCreate(BaseModel):
    name: str
    description: str = ""
    display_order: int = 0

class MenuItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    price: float
    category_id: str
    is_available: bool = True
    is_vegetarian: bool = False
    is_spicy: bool = False
    prep_time: int = 15  # minutes
    image_url: str = ""
    image: str = ""  # base64 encoded image
    track_stock: bool = False  # Whether to track stock for this item
    stock_item_id: Optional[str] = None  # Link to stock item for auto-deduct
    created_at: datetime = Field(default_factory=datetime.utcnow)

class MenuItemCreate(BaseModel):
    name: str
    description: str = ""
    price: float
    category_id: str
    is_vegetarian: bool = False
    is_spicy: bool = False
    prep_time: int = 15
    track_stock: bool = False
    stock_item_id: Optional[str] = None

class RestaurantTable(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    table_number: str
    capacity: int
    status: str = "Available"  # Available, Occupied, Reserved, Cleaning
    position_x: int = 0  # For visual layout
    position_y: int = 0  # For visual layout
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class RestaurantTableCreate(BaseModel):
    table_number: str
    capacity: int
    position_x: int = 0
    position_y: int = 0

class RestaurantStaff(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    role: str = "Waiter"  # Waiter, Chef, Manager
    phone: str = ""
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class RestaurantStaffCreate(BaseModel):
    name: str
    role: str = "Waiter"
    phone: str = ""

class RestaurantOrderItem(BaseModel):
    menu_item_id: str
    menu_item_name: str
    quantity: int
    unit_price: float
    total_price: float
    special_notes: str = ""

class RestaurantOrder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    order_number: str
    order_type: str  # "table" or "room_service"
    table_id: Optional[str] = None  # For table orders
    table_number: Optional[str] = None
    room_number: Optional[str] = None  # For room service
    customer_name: str = ""
    items: List[RestaurantOrderItem]
    subtotal: float
    tax_amount: float = 0.0
    service_charge: float = 0.0
    total_amount: float
    payment_method: str = "Cash"  # Cash, Card, Bank Transfer
    payment_status: str = "Pending"  # Pending, Paid, Cancelled
    order_status: str = "Pending"  # Pending, Preparing, Ready, Served, Cancelled
    waiter_id: Optional[str] = None
    waiter_name: str = ""
    notes: str = ""
    order_date: datetime = Field(default_factory=datetime.utcnow)
    created_by: str = "Restaurant"

class RestaurantOrderCreate(BaseModel):
    order_type: str  # "table" or "room_service"
    table_id: Optional[str] = None
    room_number: Optional[str] = None
    customer_name: str = ""
    items: List[RestaurantOrderItem]
    waiter_id: Optional[str] = None
    notes: str = ""
    service_charge_rate: float = 10.0  # Service charge percentage (default 10%)

# Authentication dependency
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current authenticated user from JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except PyJWTError:
        raise credentials_exception
    
    user = await db.users.find_one({"username": token_data.username})
    if user is None:
        raise credentials_exception
    
    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    return UserResponse(**user)

async def get_current_active_admin(current_user: UserResponse = Depends(get_current_user)):
    """Require admin role"""
    if current_user.role != "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    return current_user

# ==================== EMAIL & SMS TEMPLATES ====================

class EmailTemplate(BaseModel):
    """Email template for various occasions"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # e.g., "Reservation Confirmation", "Check-in Welcome"
    occasion: str  # reservation, checkin, checkout, custom
    subject: str
    body_html: str
    body_text: str = ""
    variables: List[str] = []  # Available placeholders like {guest_name}, {room_number}
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class EmailTemplateCreate(BaseModel):
    name: str
    occasion: str
    subject: str
    body_html: str
    body_text: str = ""
    variables: List[str] = []

class SMSSettings(BaseModel):
    """SMS gateway settings"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    provider: str = "twilio"  # twilio, notify_lk, custom
    # Twilio settings
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""
    # Notify.lk settings
    notify_lk_user_id: str = ""
    notify_lk_api_key: str = ""
    notify_lk_sender_id: str = ""
    # Custom HTTP API settings
    custom_api_url: str = ""
    custom_api_key: str = ""
    custom_api_method: str = "POST"
    custom_api_headers: dict = {}
    custom_api_body_template: str = ""  # JSON template with placeholders
    # General
    is_configured: bool = False
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class SMSSettingsUpdate(BaseModel):
    provider: Optional[str] = None
    twilio_account_sid: Optional[str] = None
    twilio_auth_token: Optional[str] = None
    twilio_phone_number: Optional[str] = None
    notify_lk_user_id: Optional[str] = None
    notify_lk_api_key: Optional[str] = None
    notify_lk_sender_id: Optional[str] = None
    custom_api_url: Optional[str] = None
    custom_api_key: Optional[str] = None
    custom_api_method: Optional[str] = None
    custom_api_headers: Optional[dict] = None
    custom_api_body_template: Optional[str] = None

class SMSTemplate(BaseModel):
    """SMS template for various occasions"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    occasion: str  # reservation, checkin, checkout, cleaning_assigned, custom
    body: str  # SMS text with placeholders
    variables: List[str] = []
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class SMSTemplateCreate(BaseModel):
    name: str
    occasion: str
    body: str
    variables: List[str] = []

# ==================== CHANNEL API SETTINGS ====================

class ChannelApiSettings(BaseModel):
    """Settings for OTA channel manager API integrations"""
    booking_com_api_key: str = ""
    booking_com_property_id: str = ""
    booking_com_enabled: bool = False
    expedia_api_key: str = ""
    expedia_property_id: str = ""
    expedia_enabled: bool = False
    agoda_api_key: str = ""
    agoda_property_id: str = ""
    agoda_enabled: bool = False
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ChannelApiSettingsUpdate(BaseModel):
    booking_com_api_key: Optional[str] = None
    booking_com_property_id: Optional[str] = None
    booking_com_enabled: Optional[bool] = None
    expedia_api_key: Optional[str] = None
    expedia_property_id: Optional[str] = None
    expedia_enabled: Optional[bool] = None
    agoda_api_key: Optional[str] = None
    agoda_property_id: Optional[str] = None
    agoda_enabled: Optional[bool] = None


# ==================== PAYMENT GATEWAY SETTINGS ====================

class PaymentSettings(BaseModel):
    active_gateway: str = ""  # payhere, paypal, webxpay
    payhere_merchant_id: str = ""
    payhere_merchant_secret: str = ""
    payhere_mode: str = "sandbox"  # sandbox or live
    paypal_client_id: str = ""
    paypal_client_secret: str = ""
    paypal_mode: str = "sandbox"
    webxpay_api_key: str = ""
    webxpay_secret: str = ""
    webxpay_mode: str = "sandbox"
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class PaymentSettingsUpdate(BaseModel):
    active_gateway: Optional[str] = None
    payhere_merchant_id: Optional[str] = None
    payhere_merchant_secret: Optional[str] = None
    payhere_mode: Optional[str] = None
    paypal_client_id: Optional[str] = None
    paypal_client_secret: Optional[str] = None
    paypal_mode: Optional[str] = None
    webxpay_api_key: Optional[str] = None
    webxpay_secret: Optional[str] = None
    webxpay_mode: Optional[str] = None

# ==================== MAINTENANCE TRACKING ====================

class MaintenanceItem(BaseModel):
    """Items purchased for room/hotel maintenance"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    item_name: str
    description: str = ""
    quantity: int = 1
    unit_price: float
    total_price: float = 0
    purchase_date: date
    room_number: Optional[str] = None  # If room-specific
    category: str = "General"  # General, Plumbing, Electrical, Furniture, Appliance, Cleaning Supplies
    vendor: str = ""
    invoice_number: str = ""
    notes: str = ""
    created_by: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)

class MaintenanceItemCreate(BaseModel):
    item_name: str
    description: str = ""
    quantity: int = 1
    unit_price: float
    purchase_date: date
    room_number: Optional[str] = None
    category: str = "General"
    vendor: str = ""
    invoice_number: str = ""
    notes: str = ""

class MaintenanceTask(BaseModel):
    """Room maintenance tasks"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    room_number: str
    task_type: str  # Repair, Replacement, Inspection, Cleaning
    description: str
    priority: str = "Medium"  # Low, Medium, High, Urgent
    status: str = "Pending"  # Pending, In Progress, Completed, Cancelled
    assigned_to: Optional[str] = None
    estimated_cost: float = 0
    actual_cost: float = 0
    scheduled_date: Optional[date] = None
    completed_date: Optional[date] = None
    notes: str = ""
    created_by: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class MaintenanceTaskCreate(BaseModel):
    room_number: str
    task_type: str
    description: str
    priority: str = "Medium"
    assigned_to: Optional[str] = None
    estimated_cost: float = 0
    scheduled_date: Optional[date] = None
    notes: str = ""

# ==================== STOCK/INVENTORY MANAGEMENT ====================

class StockItem(BaseModel):
    """Stock item for restaurant items and room maintenance supplies"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    item_name: str
    item_type: str  # restaurant, maintenance
    category: str = "General"  # For grouping - Beverages, Food, Linens, Toiletries, etc.
    unit: str = "pcs"  # pcs, bottles, kg, liters, sets, etc.
    current_stock: float = 0
    low_stock_threshold: float = 10
    cost_per_unit: float = 0
    linked_menu_item_id: Optional[str] = None  # Link to restaurant menu item for auto-deduct
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class StockItemCreate(BaseModel):
    item_name: str
    item_type: str  # restaurant, maintenance
    category: str = "General"
    unit: str = "pcs"
    current_stock: float = 0
    low_stock_threshold: float = 10
    cost_per_unit: float = 0
    linked_menu_item_id: Optional[str] = None

class StockTransaction(BaseModel):
    """Record of stock additions and removals"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    stock_item_id: str
    stock_item_name: str
    transaction_type: str  # add, remove, sale, adjustment
    quantity: float
    previous_stock: float
    new_stock: float
    notes: str = ""
    reference_id: Optional[str] = None  # Order ID if from sale
    created_by: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)

class StockAdjustment(BaseModel):
    """For adding or removing stock"""
    quantity: float
    notes: str = ""
    transaction_type: str = "add"  # add, remove, adjustment

class MenuItemUpdate(BaseModel):
    """Update menu item with stock tracking"""
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    category_id: Optional[str] = None
    is_available: Optional[bool] = None
    is_vegetarian: Optional[bool] = None
    image: Optional[str] = None
    track_stock: Optional[bool] = None
    stock_item_id: Optional[str] = None

# ==================== PAYROLL SYSTEM (Sri Lanka Specific) ====================

class Employee(BaseModel):
    """Employee/Staff account"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    employee_id: str  # Custom employee ID like EMP001
    first_name: str
    last_name: str
    email: str = ""
    phone: str = ""
    nic: str = ""  # National Identity Card
    address: str = ""
    date_of_birth: Optional[date] = None
    hire_date: date
    department: str  # Front Desk, Housekeeping, Restaurant, Maintenance, Management
    designation: str  # Manager, Supervisor, Staff, etc.
    employment_type: str = "Full-time"  # Full-time, Part-time, Contract
    status: str = "Active"  # Active, Inactive, Terminated
    # Salary details
    basic_salary: float = 0
    payment_frequency: str = "Monthly"  # Monthly, Weekly, Daily
    bank_name: str = ""
    bank_account: str = ""
    bank_branch: str = ""
    # EPF/ETF (Sri Lanka specific)
    epf_number: str = ""
    epf_contribution_employee: float = 8  # Employee contribution %
    epf_contribution_employer: float = 12  # Employer contribution %
    etf_contribution: float = 3  # ETF contribution %
    # Tax
    tax_number: str = ""
    # Notes
    notes: str = ""
    profile_image: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class EmployeeCreate(BaseModel):
    employee_id: str
    first_name: str
    last_name: str
    email: str = ""
    phone: str = ""
    nic: str = ""
    address: str = ""
    date_of_birth: Optional[date] = None
    hire_date: date
    department: str
    designation: str
    employment_type: str = "Full-time"
    basic_salary: float = 0
    payment_frequency: str = "Monthly"
    bank_name: str = ""
    bank_account: str = ""
    bank_branch: str = ""
    epf_number: str = ""
    tax_number: str = ""
    notes: str = ""

class SalaryComponent(BaseModel):
    """Allowances and deductions"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # e.g., "Transport Allowance", "Meal Allowance", "Insurance"
    type: str  # allowance, deduction
    amount_type: str = "fixed"  # fixed, percentage
    amount: float = 0
    percentage_of: str = ""  # basic_salary, gross_salary
    is_taxable: bool = True
    applies_to_all: bool = False
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class SalaryComponentCreate(BaseModel):
    name: str
    type: str
    amount_type: str = "fixed"
    amount: float = 0
    percentage_of: str = ""
    is_taxable: bool = True
    applies_to_all: bool = False

class EmployeeSalaryComponent(BaseModel):
    """Link salary components to specific employees"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    employee_id: str
    component_id: str
    custom_amount: Optional[float] = None  # Override default amount
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Loan(BaseModel):
    """Employee loans"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    employee_id: str
    loan_type: str  # Salary Advance, Personal Loan, Emergency Loan
    amount: float
    interest_rate: float = 0  # Annual interest rate %
    disbursement_date: date
    repayment_start_date: date
    installment_amount: float
    installment_frequency: str = "Monthly"  # Monthly, Weekly
    total_installments: int
    paid_installments: int = 0
    remaining_balance: float = 0
    status: str = "Active"  # Active, Completed, Cancelled
    notes: str = ""
    approved_by: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class LoanCreate(BaseModel):
    employee_id: str
    loan_type: str
    amount: float
    interest_rate: float = 0
    disbursement_date: date
    repayment_start_date: date
    installment_amount: float
    installment_frequency: str = "Monthly"
    total_installments: int
    notes: str = ""

class PayrollRun(BaseModel):
    """Monthly/Weekly payroll run"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    pay_period_start: date
    pay_period_end: date
    payment_date: date
    status: str = "Draft"  # Draft, Processing, Completed, Cancelled
    total_gross: float = 0
    total_deductions: float = 0
    total_net: float = 0
    total_epf_employee: float = 0
    total_epf_employer: float = 0
    total_etf: float = 0
    processed_by: str = ""
    notes: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class PaySlip(BaseModel):
    """Individual pay slip"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    payroll_run_id: str
    employee_id: str
    employee_name: str
    pay_period_start: date
    pay_period_end: date
    payment_date: date
    # Earnings
    basic_salary: float = 0
    allowances: List[dict] = []  # [{name, amount}]
    overtime_hours: float = 0
    overtime_rate: float = 0
    overtime_amount: float = 0
    gross_salary: float = 0
    # Deductions
    deductions: List[dict] = []  # [{name, amount}]
    loan_deduction: float = 0
    epf_employee: float = 0
    tax_deduction: float = 0
    total_deductions: float = 0
    # Net
    net_salary: float = 0
    # Employer contributions (for records)
    epf_employer: float = 0
    etf_employer: float = 0
    # Payment
    payment_method: str = "Bank Transfer"
    bank_details: str = ""
    status: str = "Pending"  # Pending, Paid
    created_at: datetime = Field(default_factory=datetime.utcnow)

# ==================== END NEW MODELS ====================

# Email service functions
async def get_email_settings():
    """Get email settings from database"""
    settings = await db.email_settings.find_one()
    if not settings:
        return None
    return EmailSettings(**settings)

async def send_email_smtp(email_settings: EmailSettings, to_email: str, subject: str, body: str):
    """Send email via SMTP"""
    try:
        msg = MIMEMultipart()
        msg['From'] = f"{email_settings.from_name} <{email_settings.from_email}>"
        msg['To'] = to_email
        msg['Subject'] = subject
        
        msg.attach(MIMEText(body, 'plain'))
        
        server = smtplib.SMTP(email_settings.smtp_host, email_settings.smtp_port)
        server.starttls()
        server.login(email_settings.smtp_username, email_settings.smtp_password)
        server.send_message(msg)
        server.quit()
        
        return True
    except Exception as e:
        print(f"SMTP Error: {str(e)}")
        return False

async def send_email_sendgrid(email_settings: EmailSettings, to_email: str, subject: str, body: str):
    """Send email via SendGrid (would require sendgrid library)"""
    # Placeholder for SendGrid implementation
    print(f"SendGrid email would be sent to {to_email}")
    return True

async def send_email_ses(email_settings: EmailSettings, to_email: str, subject: str, body: str):
    """Send email via AWS SES"""
    try:
        ses_client = boto3.client(
            'ses',
            aws_access_key_id=email_settings.aws_access_key,
            aws_secret_access_key=email_settings.aws_secret_key,
            region_name=email_settings.aws_region
        )
        
        response = ses_client.send_email(
            Destination={'ToAddresses': [to_email]},
            Message={
                'Body': {'Text': {'Charset': 'UTF-8', 'Data': body}},
                'Subject': {'Charset': 'UTF-8', 'Data': subject},
            },
            Source=email_settings.from_email,
        )
        return True
    except NoCredentialsError:
        print("AWS credentials not found")
        return False
    except Exception as e:
        print(f"SES Error: {str(e)}")
        return False

async def send_email_brevo(email_settings: EmailSettings, to_email: str, subject: str, body: str):
    """Send email via Brevo (formerly Sendinblue) API"""
    import httpx
    
    try:
        url = "https://api.brevo.com/v3/smtp/email"
        headers = {
            "accept": "application/json",
            "api-key": email_settings.brevo_api_key,
            "content-type": "application/json"
        }
        payload = {
            "sender": {
                "name": email_settings.from_name or "Hotel Management",
                "email": email_settings.from_email
            },
            "to": [{"email": to_email}],
            "subject": subject,
            "textContent": body
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers, timeout=30.0)
            if response.status_code in [200, 201]:
                return True
            else:
                print(f"Brevo Error: {response.status_code} - {response.text}")
                return False
    except Exception as e:
        print(f"Brevo Error: {str(e)}")
        return False

async def send_email(to_email: str, subject: str, body: str):
    """Send email using configured provider"""
    email_settings = await get_email_settings()
    if not email_settings or not email_settings.is_configured:
        return False
    
    if email_settings.provider == "smtp":
        return await send_email_smtp(email_settings, to_email, subject, body)
    elif email_settings.provider == "sendgrid":
        return await send_email_sendgrid(email_settings, to_email, subject, body)
    elif email_settings.provider == "ses":
        return await send_email_ses(email_settings, to_email, subject, body)
    elif email_settings.provider == "brevo":
        return await send_email_brevo(email_settings, to_email, subject, body)
    else:
        return False

# SMS Service Functions
async def get_sms_settings_helper():
    """Get SMS settings from database"""
    settings = await db.sms_settings.find_one({}, {"_id": 0})
    if not settings:
        return None
    return settings

async def send_sms_notify_lk(settings: dict, phone_number: str, message: str):
    """Send SMS via Notify.lk API (Sri Lanka)"""
    import httpx
    
    try:
        # Format phone number: remove spaces/dashes, convert local to international
        phone = phone_number.strip().replace(" ", "").replace("-", "")
        if phone.startswith("+94"):
            phone = phone[1:]  # Remove + → 94...
        elif phone.startswith("0"):
            phone = "94" + phone[1:]  # 077... → 9477...
        elif not phone.startswith("94"):
            phone = "94" + phone
        
        url = "https://app.notify.lk/api/v1/send"
        payload = {
            "user_id": settings.get("notify_lk_user_id"),
            "api_key": settings.get("notify_lk_api_key"),
            "sender_id": settings.get("notify_lk_sender_id"),
            "to": phone,
            "message": message
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, data=payload, timeout=30.0)
            print(f"Notify.lk response: {response.status_code} - {response.text}")
            if response.status_code == 200:
                return True
            else:
                print(f"Notify.lk Error: {response.text}")
                return False
    except Exception as e:
        print(f"Notify.lk Error: {str(e)}")
        return False

async def send_sms_twilio(settings: dict, phone_number: str, message: str):
    """Send SMS via Twilio API"""
    import httpx
    import base64
    
    try:
        account_sid = settings.get("twilio_account_sid")
        auth_token = settings.get("twilio_auth_token")
        from_number = settings.get("twilio_phone_number")
        
        url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
        auth = base64.b64encode(f"{account_sid}:{auth_token}".encode()).decode()
        headers = {
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/x-www-form-urlencoded"
        }
        payload = {
            "From": from_number,
            "To": phone_number,
            "Body": message
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, data=payload, headers=headers, timeout=30.0)
            if response.status_code in [200, 201]:
                return True
            else:
                print(f"Twilio Error: {response.status_code} - {response.text}")
                return False
    except Exception as e:
        print(f"Twilio Error: {str(e)}")
        return False

async def send_sms_custom(settings: dict, phone_number: str, message: str):
    """Send SMS via Custom HTTP API"""
    import httpx
    
    try:
        url = settings.get("custom_api_url")
        method = settings.get("custom_api_method", "POST")
        headers = settings.get("custom_api_headers", {})
        body_template = settings.get("custom_api_body_template", "")
        
        # Replace placeholders in body template
        body = body_template.replace("{phone}", phone_number).replace("{message}", message)
        
        if settings.get("custom_api_key"):
            headers["Authorization"] = f"Bearer {settings.get('custom_api_key')}"
        
        async with httpx.AsyncClient() as client:
            if method.upper() == "POST":
                response = await client.post(url, content=body, headers=headers, timeout=30.0)
            else:
                response = await client.get(url, headers=headers, timeout=30.0)
            
            if response.status_code in [200, 201]:
                return True
            else:
                print(f"Custom SMS API Error: {response.status_code}")
                return False
    except Exception as e:
        print(f"Custom SMS API Error: {str(e)}")
        return False

async def send_sms(phone_number: str, message: str):
    """Send SMS using configured provider"""
    settings = await get_sms_settings_helper()
    if not settings or not settings.get("is_configured"):
        return False
    
    provider = settings.get("provider", "twilio")
    
    if provider == "twilio":
        return await send_sms_twilio(settings, phone_number, message)
    elif provider == "notify_lk":
        return await send_sms_notify_lk(settings, phone_number, message)
    elif provider == "custom":
        return await send_sms_custom(settings, phone_number, message)
    else:
        return False

async def send_booking_notification_sms(booking_data: dict, occasion: str = "reservation"):
    """Send SMS notification for booking events (reservation, checkin, checkout)"""
    try:
        # Check if SMS is configured
        sms_settings = await get_sms_settings_helper()
        if not sms_settings or not sms_settings.get("is_configured"):
            print("SMS settings not configured, skipping notification")
            return False
        
        # Get the phone number from booking
        phone_number = booking_data.get("guest_phone") or booking_data.get("phone")
        if not phone_number:
            print("No phone number provided, skipping SMS")
            return False
        
        # Get the template for this occasion
        template = await db.sms_templates.find_one({"occasion": occasion})
        if not template:
            print(f"No SMS template found for occasion: {occasion}")
            return False
        
        # Get hotel settings for template variables
        hotel_settings = await db.settings.find_one() or {}
        
        # Prepare template variables
        template_vars = {
            "guest_name": booking_data.get("guest_name") or booking_data.get("name", "Guest"),
            "hotel_name": hotel_settings.get("hotel_name", "Our Hotel"),
            "room_number": booking_data.get("room_number") or booking_data.get("current_room", ""),
            "check_in_date": str(booking_data.get("check_in_date", ""))[:10],
            "check_out_date": str(booking_data.get("check_out_date", ""))[:10],
            "hotel_phone": hotel_settings.get("phone", ""),
            "wifi_password": hotel_settings.get("wifi_password", ""),
            "total_amount": str(booking_data.get("total_amount", booking_data.get("booking_amount", 0))),
            # For cleaning staff notifications
            "staff_name": booking_data.get("staff_name", ""),
        }
        
        # Replace variables in template body
        message = template.get("body", "")
        for var_name, var_value in template_vars.items():
            message = message.replace(f"{{{var_name}}}", str(var_value))
        
        # Send the SMS
        result = await send_sms(phone_number, message)
        if result:
            print(f"SMS notification sent successfully to {phone_number} for {occasion}")
        else:
            print(f"Failed to send SMS notification to {phone_number}")
        return result
    except Exception as e:
        print(f"Error sending booking notification SMS: {str(e)}")
        return False

async def send_booking_notification_email(booking_data: dict, occasion: str = "reservation"):
    """Send Email notification for booking events (reservation, checkin, checkout)"""
    try:
        # Get the email from booking
        email_address = booking_data.get("guest_email") or booking_data.get("email")
        if not email_address:
            print("No email address provided, skipping email notification")
            return False
        
        # Get the template for this occasion
        template = await db.email_templates.find_one({"occasion": occasion})
        if not template:
            print(f"No email template found for occasion: {occasion}")
            return False
        
        # Get hotel settings for template variables
        hotel_settings = await db.settings.find_one() or {}
        
        # Prepare template variables
        template_vars = {
            "guest_name": booking_data.get("guest_name") or booking_data.get("name", "Guest"),
            "hotel_name": hotel_settings.get("hotel_name", "Our Hotel"),
            "room_number": booking_data.get("room_number") or booking_data.get("current_room", ""),
            "check_in_date": str(booking_data.get("check_in_date", ""))[:10],
            "check_out_date": str(booking_data.get("check_out_date", ""))[:10],
            "hotel_phone": hotel_settings.get("phone", ""),
            "wifi_password": hotel_settings.get("wifi_password", ""),
            "total_amount": str(booking_data.get("total_amount", booking_data.get("booking_amount", 0))),
        }
        
        # Replace variables in subject and body
        subject = template.get("subject", "Hotel Notification")
        body_html = template.get("body_html", "")
        body_text = template.get("body_text", "")
        
        for var_name, var_value in template_vars.items():
            subject = subject.replace(f"{{{var_name}}}", str(var_value))
            body_html = body_html.replace(f"{{{var_name}}}", str(var_value))
            body_text = body_text.replace(f"{{{var_name}}}", str(var_value))
        
        # Send the email (prefer HTML, fallback to text)
        body = body_html if body_html.strip() else body_text
        result = await send_email(email_address, subject, body)
        if result:
            print(f"Email notification sent successfully to {email_address} for {occasion}")
        else:
            print(f"Failed to send email notification to {email_address}")
        return result
    except Exception as e:
        print(f"Error sending booking notification email: {str(e)}")
        return False

async def send_notifications(data: dict, occasion: str):
    """Send both SMS and Email notifications for an occasion (non-blocking)"""
    try:
        # Send SMS notification
        await send_booking_notification_sms(data, occasion)
    except Exception as e:
        print(f"SMS notification error (non-critical): {str(e)}")
    
    try:
        # Send Email notification
        await send_booking_notification_email(data, occasion)
    except Exception as e:
        print(f"Email notification error (non-critical): {str(e)}")

# Tax Calculation Helper Functions
async def get_active_taxes_for_bookings():
    """Get active tax configurations for bookings/checkout"""
    taxes = await db.tax_configs.find(
        {"is_active": True, "apply_to_bookings": True},
        {"_id": 0}
    ).to_list(100)
    return taxes

async def get_active_taxes_for_restaurant():
    """Get active tax configurations for restaurant bills"""
    taxes = await db.tax_configs.find(
        {"is_active": True, "apply_to_restaurant": True},
        {"_id": 0}
    ).to_list(100)
    return taxes

async def calculate_booking_taxes(subtotal: float):
    """Calculate taxes for bookings/checkout
    
    Returns:
        dict: {
            'tax_breakdown': [{name, rate, type, amount}],
            'total_tax': float,
            'grand_total': float
        }
    """
    taxes = await get_active_taxes_for_bookings()
    tax_breakdown = []
    total_tax = 0.0
    
    for tax in taxes:
        if tax.get("type") == "percentage":
            tax_amount = subtotal * (tax.get("rate", 0) / 100)
        else:  # fixed amount
            tax_amount = tax.get("rate", 0)
        
        tax_breakdown.append({
            "name": tax.get("name"),
            "rate": tax.get("rate"),
            "type": tax.get("type", "percentage"),
            "amount": round(tax_amount, 2)
        })
        total_tax += tax_amount
    
    return {
        "tax_breakdown": tax_breakdown,
        "total_tax": round(total_tax, 2),
        "grand_total": round(subtotal + total_tax, 2)
    }

async def calculate_restaurant_taxes(subtotal: float):
    """Calculate taxes for restaurant bills
    
    Returns:
        dict: {
            'tax_breakdown': [{name, rate, type, amount}],
            'total_tax': float,
            'grand_total': float
        }
    """
    taxes = await get_active_taxes_for_restaurant()
    tax_breakdown = []
    total_tax = 0.0
    
    for tax in taxes:
        if tax.get("type") == "percentage":
            tax_amount = subtotal * (tax.get("rate", 0) / 100)
        else:  # fixed amount
            tax_amount = tax.get("rate", 0)
        
        tax_breakdown.append({
            "name": tax.get("name"),
            "rate": tax.get("rate"),
            "type": tax.get("type", "percentage"),
            "amount": round(tax_amount, 2)
        })
        total_tax += tax_amount
    
    return {
        "tax_breakdown": tax_breakdown,
        "total_tax": round(total_tax, 2),
        "grand_total": round(subtotal + total_tax, 2)
    }

class Settings(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    hotel_name: str = "Hotel Management System"
    hotel_logo: str = ""  # Base64 encoded logo
    hotel_contact: str = ""
    hotel_address: str = ""
    hotel_email: str = ""
    hotel_phone: str = ""
    currency: str = "LKR"
    timezone: str = "UTC"  # Hotel timezone for all timestamps
    check_in_time: str = "14:00"
    check_out_time: str = "12:00"
    default_room_rate: float = 5000.0
    tax_rate: float = 0.0
    cash_balance: float = 0.0  # Current cash balance
    bank_balance: float = 0.0  # Current bank balance
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by: str = "Admin"

class SettingsUpdate(BaseModel):
    hotel_name: Optional[str] = None
    hotel_logo: Optional[str] = None
    hotel_contact: Optional[str] = None
    hotel_address: Optional[str] = None
    hotel_email: Optional[str] = None
    hotel_phone: Optional[str] = None
    currency: Optional[str] = None
    timezone: Optional[str] = None
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None
    default_room_rate: Optional[float] = None
    tax_rate: Optional[float] = None
    cash_balance: Optional[float] = None
    bank_balance: Optional[float] = None

class PayrollSettingsUpdate(BaseModel):
    enable_epf: Optional[bool] = None
    epf_employee_rate: Optional[float] = None
    epf_employer_rate: Optional[float] = None
    enable_etf: Optional[bool] = None
    etf_rate: Optional[float] = None
    tax_enabled: Optional[bool] = None
    tax_rate: Optional[float] = None

class ActivityLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    action: str  # "created_booking", "checked_in", "checked_out", "added_expense", etc.
    description: str
    user_name: str = "Admin"
    user_id: str = ""
    entity_type: str = ""  # "booking", "room", "expense", "income", etc.
    entity_id: str = ""
    details: dict = {}  # Additional context data
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    ip_address: str = ""

class ActivityLogCreate(BaseModel):
    action: str
    description: str
    user_name: str = "Admin"
    user_id: str = ""
    entity_type: str = ""
    entity_id: str = ""
    details: dict = {}
    ip_address: str = ""

# Activity logging helper function
async def log_activity(action: str, description: str, user_name: str = "Admin", 
                      entity_type: str = "", entity_id: str = "", details: dict = {}):
    """Helper function to log user activities"""
    try:
        activity = ActivityLog(
            action=action,
            description=description,
            user_name=user_name,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details
        )
        await db.activity_logs.insert_one(activity.dict())
    except Exception as e:
        # Log the error but don't fail the main operation
        print(f"Failed to log activity: {str(e)}")

# Room availability validation helper function
async def check_room_availability_for_booking(room_number: str, check_in_date: date, check_out_date: date, exclude_booking_id: str = None, skip_occupied_check: bool = False):
    """
    Check if a specific room is available for booking during the given date range
    Returns: (is_available: bool, error_message: str)
    skip_occupied_check: Set to True when extending stay for current occupant
    """
    try:
        # Convert dates to datetime for database queries
        check_in_datetime = datetime.combine(check_in_date, datetime.min.time())
        check_out_datetime = datetime.combine(check_out_date, datetime.min.time())
        
        # Check if room exists
        room = await db.rooms.find_one({"room_number": room_number})
        if not room:
            return False, f"Room {room_number} does not exist"
        
        # Build query to find conflicting bookings
        conflict_query = {
            "$and": [
                {"room_number": room_number},
                {"status": {"$in": ["Upcoming", "Checked-in", "Checked In"]}},
                {
                    "$or": [
                        # Booking starts during requested period
                        {
                            "$and": [
                                {"check_in_date": {"$gte": check_in_datetime}},
                                {"check_in_date": {"$lt": check_out_datetime}}
                            ]
                        },
                        # Booking ends during requested period
                        {
                            "$and": [
                                {"check_out_date": {"$gt": check_in_datetime}},
                                {"check_out_date": {"$lte": check_out_datetime}}
                            ]
                        },
                        # Booking encompasses requested period
                        {
                            "$and": [
                                {"check_in_date": {"$lte": check_in_datetime}},
                                {"check_out_date": {"$gte": check_out_datetime}}
                            ]
                        }
                    ]
                }
            ]
        }
        
        # Exclude specific booking ID if provided (for booking updates)
        if exclude_booking_id:
            conflict_query["$and"].append({"id": {"$ne": exclude_booking_id}})
        
        # Find conflicting bookings
        conflicting_bookings = await db.bookings.find(conflict_query).to_list(10)
        
        if conflicting_bookings:
            # Get details of the first conflicting booking
            conflict = conflicting_bookings[0]
            conflict_guest = conflict.get('guest_name', 'Unknown Guest')
            conflict_checkin = conflict.get('check_in_date')
            conflict_checkout = conflict.get('check_out_date')
            
            # Convert datetime to date for display
            if isinstance(conflict_checkin, datetime):
                conflict_checkin = conflict_checkin.date()
            if isinstance(conflict_checkout, datetime):
                conflict_checkout = conflict_checkout.date()
                
            error_msg = f"Room {room_number} is already booked by {conflict_guest} from {conflict_checkin} to {conflict_checkout}"
            return False, error_msg
        
        # Check if room is currently occupied (status = "Occupied")
        # Skip this check if we're extending stay for the current occupant
        if not skip_occupied_check and room.get('status') == 'Occupied':
            current_guest = room.get('current_guest', 'Unknown Guest')
            room_checkout = room.get('check_out_date')
            if isinstance(room_checkout, datetime):
                room_checkout = room_checkout.date()
            
            # Only block if the requested check-in is before room checkout
            if room_checkout and check_in_date < room_checkout:
                error_msg = f"Room {room_number} is currently occupied by {current_guest} until {room_checkout}"
                return False, error_msg
        
        return True, ""
        
    except Exception as e:
        return False, f"Error checking room availability: {str(e)}"

# Setup Wizard Routes
@api_router.get("/setup/status")
async def get_setup_status():
    """Check if initial setup has been completed"""
    setup = await db.setup_wizard.find_one()
    if setup:
        return {"is_completed": setup.get("is_completed", False)}
    return {"is_completed": False}

@api_router.post("/setup/complete")
async def complete_setup(setup_request: SetupWizardRequest):
    """Complete initial setup wizard"""
    # Check if setup is already completed
    existing_setup = await db.setup_wizard.find_one()
    if existing_setup and existing_setup.get("is_completed"):
        raise HTTPException(status_code=400, detail="Setup already completed")
    
    # Create/update hotel settings
    settings_update = {
        "hotel_name": setup_request.hotel_name,
        "hotel_address": setup_request.hotel_address,
        "hotel_email": setup_request.hotel_email,
        "timezone": setup_request.timezone,
        "updated_at": datetime.utcnow()
    }
    
    # Check if settings exist
    existing_settings = await db.settings.find_one()
    if existing_settings:
        await db.settings.update_one(
            {"id": existing_settings["id"]},
            {"$set": settings_update}
        )
    else:
        default_settings = Settings(**settings_update)
        await db.settings.insert_one(default_settings.dict())
    
    # Create admin user with must_change_password flag
    admin_user = User(
        username="admin",
        password_hash=get_password_hash("admin123"),
        full_name="System Administrator",
        role="Admin",
        email=setup_request.hotel_email,
        must_change_password=True  # Force password change on first login
    )
    
    # Check if admin already exists
    existing_admin = await db.users.find_one({"username": "admin"})
    if existing_admin:
        # Update admin user
        await db.users.update_one(
            {"username": "admin"},
            {"$set": {
                "password_hash": get_password_hash("admin123"),
                "email": setup_request.hotel_email,
                "full_name": "System Administrator",
                "must_change_password": True
            }}
        )
    else:
        await db.users.insert_one(admin_user.dict())
    
    # Create initial balance records if any balance is provided
    setup_date = datetime.utcnow().date()
    
    if setup_request.cash_balance > 0:
        initial_cash_income = Income(
            description="Initial Cash Balance - Setup",
            amount=setup_request.cash_balance,
            category="Initial Setup",
            payment_method="Cash",
            income_date=setup_date,
            guest_name="",
            created_by="System"
        )
        # Convert date to datetime for MongoDB compatibility
        income_dict = initial_cash_income.dict()
        if isinstance(income_dict['income_date'], date):
            income_dict['income_date'] = datetime.combine(income_dict['income_date'], datetime.min.time())
        await db.incomes.insert_one(income_dict)
    
    if setup_request.bank_balance > 0:
        initial_bank_income = Income(
            description="Initial Bank Balance - Setup",
            amount=setup_request.bank_balance,
            category="Initial Setup",
            payment_method="Bank Transfer",
            income_date=setup_date,
            guest_name="",
            created_by="System"
        )
        # Convert date to datetime for MongoDB compatibility
        income_dict = initial_bank_income.dict()
        if isinstance(income_dict['income_date'], date):
            income_dict['income_date'] = datetime.combine(income_dict['income_date'], datetime.min.time())
        await db.incomes.insert_one(income_dict)

    # Mark setup as completed
    setup_wizard = SetupWizard(
        is_completed=True,
        hotel_name=setup_request.hotel_name,
        hotel_address=setup_request.hotel_address,
        hotel_email=setup_request.hotel_email,
        timezone=setup_request.timezone,
        cash_balance=setup_request.cash_balance,
        bank_balance=setup_request.bank_balance,
        admin_created=True,
        completed_at=datetime.utcnow()
    )
    
    if existing_setup:
        await db.setup_wizard.update_one(
            {"id": existing_setup["id"]},
            {"$set": setup_wizard.dict()}
        )
    else:
        await db.setup_wizard.insert_one(setup_wizard.dict())
    
    # Log activity
    balance_info = ""
    if setup_request.cash_balance > 0 or setup_request.bank_balance > 0:
        balance_info = f" with initial balances - Cash: {setup_request.cash_balance}, Bank: {setup_request.bank_balance}"
    
    await log_activity(
        action="setup_completed",
        description=f"Initial setup completed for {setup_request.hotel_name}{balance_info}",
        entity_type="setup"
    )
    
    return {"message": "Setup completed successfully"}

# Authentication Routes
@api_router.post("/auth/login")
async def login(user_credentials: UserLogin):
    """User login"""
    # Find user by username
    user = await db.users.find_one({"username": user_credentials.username})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Verify password
    if not verify_password(user_credentials.password, user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if user is active
    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["username"]}, expires_delta=access_token_expires
    )
    
    # Update last login
    await db.users.update_one(
        {"username": user_credentials.username},
        {"$set": {"last_login": datetime.utcnow()}}
    )
    
    # Log activity
    await log_activity(
        action="user_login",
        description=f"User {user['username']} logged in",
        user_name=user["username"],
        entity_type="auth"
    )
    
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "must_change_password": user.get("must_change_password", False),
        "user": {
            "id": user.get("id"),
            "username": user.get("username"),
            "full_name": user.get("full_name"),
            "role": user.get("role"),
            "email": user.get("email", ""),
            "page_permissions": user.get("page_permissions", [])
        }
    }

@api_router.post("/auth/logout")
async def logout(current_user: UserResponse = Depends(get_current_user)):
    """User logout (mainly for logging purposes)"""
    await log_activity(
        action="user_logout",
        description=f"User {current_user.username} logged out",
        user_name=current_user.username,
        entity_type="auth"
    )
    return {"message": "Logged out successfully"}

@api_router.get("/auth/me", response_model=UserResponse)
async def get_current_user_info(current_user: UserResponse = Depends(get_current_user)):
    """Get current user information"""
    return current_user

# Helper function to generate OTP
def generate_otp(length: int = 6) -> str:
    """Generate a numeric OTP"""
    import random
    return ''.join([str(random.randint(0, 9)) for _ in range(length)])

@api_router.post("/auth/request-otp")
async def request_password_reset_otp(request: PasswordResetRequest):
    """Send OTP to user's email for password reset"""
    # Find user by email
    user = await db.users.find_one({"email": request.email})
    
    if not user:
        # Don't reveal if user exists or not for security - but still return success
        return {"message": "If the email is registered, an OTP has been sent"}
    
    # Generate OTP
    otp = generate_otp()
    expires_at = datetime.utcnow() + timedelta(minutes=10)  # OTP valid for 10 minutes
    
    # Store OTP record
    otp_record = OTPRecord(
        email=request.email,
        otp=otp,
        expires_at=expires_at
    )
    
    # Remove any existing unused OTPs for this email
    await db.otp_records.delete_many({"email": request.email, "used": False})
    
    # Save new OTP
    await db.otp_records.insert_one(otp_record.dict())
    
    # Send email
    subject = "Password Reset OTP - Hotel Management System"
    body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #2563eb;">Password Reset Request</h2>
        <p>Dear {user.get('full_name', user.get('username'))},</p>
        <p>You have requested to reset your password. Use the following OTP to complete the process:</p>
        <div style="background-color: #f3f4f6; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <h1 style="color: #1f2937; letter-spacing: 8px; font-size: 32px; margin: 0;">{otp}</h1>
        </div>
        <p style="color: #6b7280;"><strong>This OTP is valid for 10 minutes.</strong></p>
        <p>If you did not request this password reset, please ignore this email or contact your administrator.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #9ca3af; font-size: 12px;">Hotel Management System</p>
    </body>
    </html>
    """
    
    email_sent = await send_email(user["email"], subject, body)
    
    if email_sent:
        await log_activity(
            action="otp_requested",
            description=f"Password reset OTP requested for {user['username']}",
            user_name=user["username"],
            entity_type="auth"
        )
        return {"message": "OTP has been sent to your email"}
    else:
        raise HTTPException(
            status_code=500,
            detail="Failed to send email. Please ensure email settings are configured correctly."
        )

@api_router.post("/auth/verify-otp-reset")
async def verify_otp_and_reset_password(request: PasswordResetVerify):
    """Verify OTP and reset password"""
    # Find valid OTP
    otp_record = await db.otp_records.find_one({
        "email": request.email,
        "otp": request.otp,
        "used": False,
        "expires_at": {"$gt": datetime.utcnow()}
    })
    
    if not otp_record:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired OTP"
        )
    
    # Find user
    user = await db.users.find_one({"email": request.email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Validate new password
    if len(request.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    
    # Update password
    hashed_password = get_password_hash(request.new_password)
    await db.users.update_one(
        {"email": request.email},
        {"$set": {"password_hash": hashed_password, "must_change_password": False}}
    )
    
    # Mark OTP as used
    await db.otp_records.update_one(
        {"id": otp_record["id"]},
        {"$set": {"used": True}}
    )
    
    await log_activity(
        action="password_reset_otp",
        description=f"Password reset via OTP for user {user['username']}",
        user_name=user["username"],
        entity_type="auth"
    )
    
    return {"message": "Password has been reset successfully"}

@api_router.post("/auth/change-password")
async def change_password(request: PasswordChangeRequest, current_user: UserResponse = Depends(get_current_user)):
    """Change password for logged-in user"""
    # Get user from database
    user = await db.users.find_one({"username": current_user.username})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Verify current password
    if not verify_password(request.current_password, user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    # Validate new password
    if len(request.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    
    if request.current_password == request.new_password:
        raise HTTPException(status_code=400, detail="New password must be different from current password")
    
    # Update password
    hashed_password = get_password_hash(request.new_password)
    await db.users.update_one(
        {"username": current_user.username},
        {"$set": {"password_hash": hashed_password, "must_change_password": False}}
    )
    
    await log_activity(
        action="password_changed",
        description=f"Password changed for user {current_user.username}",
        user_name=current_user.username,
        entity_type="auth"
    )
    
    return {"message": "Password changed successfully"}

@api_router.post("/auth/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    """Send new password to user's email (legacy - use request-otp instead)"""
    # Find user by username or email
    user = await db.users.find_one({
        "$or": [
            {"username": request.username_or_email},
            {"email": request.username_or_email}
        ]
    })
    
    if not user:
        # Don't reveal if user exists or not for security
        return {"message": "If the account exists, a new password has been sent to the registered email"}
    
    if not user.get("email"):
        raise HTTPException(
            status_code=400,
            detail="No email associated with this account"
        )
    
    # Generate new password
    new_password = generate_random_password()
    hashed_password = get_password_hash(new_password)
    
    # Update user password and set must_change_password flag
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hashed_password, "must_change_password": True}}
    )
    
    # Send email
    subject = "Password Reset - Hotel Management System"
    body = f"""
    Dear {user.get('full_name', user.get('username'))},

    Your password has been reset. Here are your new login credentials:

    Username: {user['username']}
    New Password: {new_password}

    Please login with these credentials and change your password immediately.

    Best regards,
    Hotel Management Team
    """
    
    email_sent = await send_email(user["email"], subject, body)
    
    if email_sent:
        # Log activity
        await log_activity(
            action="password_reset",
            description=f"Password reset for user {user['username']}",
            user_name=user["username"],
            entity_type="auth"
        )
        return {"message": "New password has been sent to your email"}
    else:
        raise HTTPException(
            status_code=500,
            detail="Failed to send email. Please contact administrator."
        )

# Email Settings Routes
@api_router.get("/email-settings")
async def get_email_settings_api(current_user: UserResponse = Depends(get_current_active_admin)):
    """Get email settings (Admin only)"""
    settings = await get_email_settings()
    if not settings:
        return EmailSettings().dict()
    
    # Hide sensitive information
    settings_dict = settings.dict()
    if settings_dict.get("smtp_password"):
        settings_dict["smtp_password"] = "***"
    if settings_dict.get("sendgrid_api_key"):
        settings_dict["sendgrid_api_key"] = "***"
    if settings_dict.get("aws_secret_key"):
        settings_dict["aws_secret_key"] = "***"
    if settings_dict.get("brevo_api_key"):
        settings_dict["brevo_api_key_display"] = settings_dict["brevo_api_key"][:12] + "***"
    
    return settings_dict

@api_router.put("/email-settings")
async def update_email_settings(
    settings_update: EmailSettingsUpdate,
    current_user: UserResponse = Depends(get_current_active_admin)
):
    """Update email settings (Admin only)"""
    # Get current settings or create default
    current_settings = await get_email_settings()
    is_new_settings = current_settings is None
    if not current_settings:
        current_settings = EmailSettings()
    
    # Update only provided fields
    update_data = {k: v for k, v in settings_update.dict().items() if v is not None}
    update_data['updated_at'] = datetime.utcnow()
    
    # Check if configuration is complete
    if settings_update.provider == "smtp":
        is_configured = all([
            update_data.get("smtp_host") or current_settings.smtp_host,
            update_data.get("smtp_username") or current_settings.smtp_username,
            update_data.get("smtp_password") or current_settings.smtp_password,
            update_data.get("from_email") or current_settings.from_email
        ])
    elif settings_update.provider == "sendgrid":
        is_configured = all([
            update_data.get("sendgrid_api_key") or current_settings.sendgrid_api_key,
            update_data.get("from_email") or current_settings.from_email
        ])
    elif settings_update.provider == "ses":
        is_configured = all([
            update_data.get("aws_access_key") or current_settings.aws_access_key,
            update_data.get("aws_secret_key") or current_settings.aws_secret_key,
            update_data.get("from_email") or current_settings.from_email
        ])
    elif settings_update.provider == "brevo":
        is_configured = all([
            update_data.get("brevo_api_key") or current_settings.brevo_api_key,
            update_data.get("from_email") or current_settings.from_email
        ])
    else:
        is_configured = current_settings.is_configured
    
    update_data['is_configured'] = is_configured
    
    # Update or create settings
    if not is_new_settings:
        await db.email_settings.update_one(
            {"id": current_settings.id},
            {"$set": update_data}
        )
    else:
        new_settings = EmailSettings(**update_data)
        await db.email_settings.insert_one(new_settings.dict())
    
    # Log activity
    await log_activity(
        action="email_settings_updated",
        description=f"Email settings updated by {current_user.username}",
        user_name=current_user.username,
        entity_type="settings"
    )
    
    return {"message": "Email settings updated successfully"}

# Booking Channels Management Routes  
@api_router.get("/booking-channels", response_model=List[BookingChannel])
async def get_booking_channels(current_user: UserResponse = Depends(get_current_user)):
    """Get all booking channels"""
    channels = await db.booking_channels.find().to_list(1000)
    return [BookingChannel(**channel) for channel in channels]

@api_router.post("/booking-channels", response_model=BookingChannel)
async def create_booking_channel(
    channel: BookingChannelCreate, 
    current_user: UserResponse = Depends(get_current_active_admin)
):
    """Create a new booking channel (Admin only)"""
    # Check if channel name already exists
    existing_channel = await db.booking_channels.find_one({"channel_name": channel.channel_name})
    if existing_channel:
        raise HTTPException(status_code=400, detail="Booking channel with this name already exists")
    
    channel_obj = BookingChannel(**channel.dict(), created_by=current_user.username)
    channel_dict = channel_obj.dict()
    await db.booking_channels.insert_one(channel_dict)
    
    # Log activity
    await log_activity(
        action="booking_channel_created",
        description=f"New booking channel '{channel.channel_name}' created with {channel.commission_rate}% commission",
        user_name=current_user.username,
        entity_type="booking_channel",
        entity_id=channel_obj.id
    )
    
    return BookingChannel(**channel_dict)

@api_router.put("/booking-channels/{channel_id}", response_model=BookingChannel)
async def update_booking_channel(
    channel_id: str,
    channel_update: BookingChannelUpdate,
    current_user: UserResponse = Depends(get_current_active_admin)
):
    """Update a booking channel (Admin only)"""
    channel = await db.booking_channels.find_one({"id": channel_id})
    if not channel:
        raise HTTPException(status_code=404, detail="Booking channel not found")
    
    # Update only provided fields
    update_data = {k: v for k, v in channel_update.dict().items() if v is not None}
    
    if update_data:
        result = await db.booking_channels.update_one(
            {"id": channel_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Booking channel not found")
        
        # Log activity
        await log_activity(
            action="booking_channel_updated",
            description=f"Booking channel '{channel.get('channel_name', 'Unknown')}' updated",
            user_name=current_user.username,
            entity_type="booking_channel",
            entity_id=channel_id
        )
    
    # Return updated channel
    updated_channel = await db.booking_channels.find_one({"id": channel_id})
    return BookingChannel(**updated_channel)

@api_router.delete("/booking-channels/{channel_id}")
async def delete_booking_channel(
    channel_id: str, 
    current_user: UserResponse = Depends(get_current_active_admin)
):
    """Delete a booking channel (Admin only)"""
    channel = await db.booking_channels.find_one({"id": channel_id})
    if not channel:
        raise HTTPException(status_code=404, detail="Booking channel not found")
    
    # Check if channel is being used in bookings
    bookings_count = await db.bookings.count_documents({"booking_channel_id": channel_id})
    if bookings_count > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete channel. It is used in {bookings_count} booking(s). Deactivate instead.")
    
    result = await db.booking_channels.delete_one({"id": channel_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Booking channel not found")
    
    # Log activity
    await log_activity(
        action="booking_channel_deleted",
        description=f"Booking channel '{channel.get('channel_name', 'Unknown')}' deleted",
        user_name=current_user.username,
        entity_type="booking_channel",
        entity_id=channel_id
    )
    
    return {"message": "Booking channel deleted successfully"}

@api_router.put("/booking-channels/{channel_id}/toggle-status")
async def toggle_booking_channel_status(
    channel_id: str, 
    current_user: UserResponse = Depends(get_current_active_admin)
):
    """Toggle booking channel active/inactive status (Admin only)"""
    channel = await db.booking_channels.find_one({"id": channel_id})
    if not channel:
        raise HTTPException(status_code=404, detail="Booking channel not found")
    
    new_status = not channel.get('is_active', True)
    result = await db.booking_channels.update_one(
        {"id": channel_id},
        {"$set": {"is_active": new_status}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Booking channel not found")
    
    # Log activity
    await log_activity(
        action="booking_channel_status_changed",
        description=f"Booking channel '{channel.get('channel_name', 'Unknown')}' {'activated' if new_status else 'deactivated'}",
        user_name=current_user.username,
        entity_type="booking_channel",
        entity_id=channel_id
    )
    
    return {"message": f"Booking channel {'activated' if new_status else 'deactivated'} successfully"}

# Commission Tracking Routes
@api_router.get("/commissions/summary")
async def get_commission_summary(
    year: Optional[int] = None,
    month: Optional[int] = None,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Get commission summary by booking channel
    Returns total commissions payable per channel, optionally filtered by year/month
    """
    # Default to current year/month if not specified
    now = datetime.now()
    target_year = year or now.year
    target_month = month  # None means all months for the year
    
    # Build date filter for bookings
    if target_month:
        # Filter for specific month
        start_date = datetime(target_year, target_month, 1)
        if target_month == 12:
            end_date = datetime(target_year + 1, 1, 1)
        else:
            end_date = datetime(target_year, target_month + 1, 1)
    else:
        # Filter for entire year
        start_date = datetime(target_year, 1, 1)
        end_date = datetime(target_year + 1, 1, 1)
    
    # Get all booking channels
    channels = await db.booking_channels.find().to_list(1000)
    channel_map = {ch['id']: ch for ch in channels}
    
    # Get bookings with commission for the period (exclude cancelled bookings)
    bookings = await db.bookings.find({
        "created_at": {"$gte": start_date, "$lt": end_date},
        "commission_amount": {"$gt": 0},
        "status": {"$ne": "Cancelled"}
    }).to_list(10000)
    
    # Aggregate commissions by channel
    channel_commissions = {}
    for booking in bookings:
        channel_id = booking.get('booking_channel_id', '')
        channel_name = booking.get('booking_channel_name', 'Direct')
        commission = booking.get('commission_amount', 0)
        
        if channel_name not in channel_commissions:
            channel_commissions[channel_name] = {
                'channel_id': channel_id,
                'channel_name': channel_name,
                'total_commission': 0,
                'booking_count': 0,
                'total_booking_amount': 0
            }
        
        channel_commissions[channel_name]['total_commission'] += commission
        channel_commissions[channel_name]['booking_count'] += 1
        channel_commissions[channel_name]['total_booking_amount'] += booking.get('booking_amount', 0)
    
    # Convert to list and sort by total commission
    summary = list(channel_commissions.values())
    summary.sort(key=lambda x: x['total_commission'], reverse=True)
    
    # Calculate grand total
    grand_total = sum(ch['total_commission'] for ch in summary)
    
    return {
        'year': target_year,
        'month': target_month,
        'channels': summary,
        'grand_total': grand_total,
        'total_bookings': sum(ch['booking_count'] for ch in summary)
    }

@api_router.get("/commissions/monthly-breakdown")
async def get_commission_monthly_breakdown(
    year: Optional[int] = None,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Get monthly commission breakdown for all channels for a given year
    """
    target_year = year or datetime.now().year
    
    # Get bookings for the year (exclude cancelled bookings)
    start_date = datetime(target_year, 1, 1)
    end_date = datetime(target_year + 1, 1, 1)
    
    bookings = await db.bookings.find({
        "created_at": {"$gte": start_date, "$lt": end_date},
        "commission_amount": {"$gt": 0},
        "status": {"$ne": "Cancelled"}
    }).to_list(10000)
    
    # Aggregate by month and channel
    monthly_data = {}
    for month in range(1, 13):
        monthly_data[month] = {}
    
    for booking in bookings:
        booking_month = booking['created_at'].month
        channel_name = booking.get('booking_channel_name', 'Direct')
        commission = booking.get('commission_amount', 0)
        
        if channel_name not in monthly_data[booking_month]:
            monthly_data[booking_month][channel_name] = 0
        monthly_data[booking_month][channel_name] += commission
    
    # Format response
    months = ['January', 'February', 'March', 'April', 'May', 'June', 
              'July', 'August', 'September', 'October', 'November', 'December']
    
    result = []
    for month_num in range(1, 13):
        month_entry = {
            'month': month_num,
            'month_name': months[month_num - 1],
            'channels': monthly_data[month_num],
            'total': sum(monthly_data[month_num].values())
        }
        result.append(month_entry)
    
    return {
        'year': target_year,
        'monthly_breakdown': result,
        'year_total': sum(m['total'] for m in result)
    }

@api_router.get("/commissions/channel-details/{channel_id}")
async def get_channel_commission_details(
    channel_id: str,
    year: Optional[int] = None,
    month: Optional[int] = None,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Get detailed commission bookings for a specific channel
    """
    target_year = year or datetime.now().year
    
    # Build date filter
    if month:
        start_date = datetime(target_year, month, 1)
        if month == 12:
            end_date = datetime(target_year + 1, 1, 1)
        else:
            end_date = datetime(target_year, month + 1, 1)
    else:
        start_date = datetime(target_year, 1, 1)
        end_date = datetime(target_year + 1, 1, 1)
    
    # Get channel info
    channel = await db.booking_channels.find_one({"id": channel_id}, {"_id": 0})
    
    # Get bookings for this channel (exclude cancelled bookings)
    bookings = await db.bookings.find({
        "booking_channel_id": channel_id,
        "created_at": {"$gte": start_date, "$lt": end_date},
        "commission_amount": {"$gt": 0},
        "status": {"$ne": "Cancelled"}
    }).sort("created_at", -1).to_list(1000)
    
    # Format bookings
    formatted_bookings = []
    total_commission = 0
    for booking in bookings:
        commission = booking.get('commission_amount', 0)
        total_commission += commission
        
        formatted_bookings.append({
            'id': booking['id'],
            'guest_name': booking['guest_name'],
            'room_number': booking['room_number'],
            'check_in_date': booking['check_in_date'].isoformat() if isinstance(booking['check_in_date'], (date, datetime)) else str(booking['check_in_date']),
            'check_out_date': booking['check_out_date'].isoformat() if isinstance(booking['check_out_date'], (date, datetime)) else str(booking['check_out_date']),
            'booking_amount': booking.get('booking_amount', 0),
            'commission_amount': commission,
            'status': booking.get('status', 'Unknown'),
            'created_at': booking['created_at'].isoformat() if isinstance(booking['created_at'], datetime) else str(booking['created_at'])
        })
    
    return {
        'channel': channel if channel else {'channel_name': 'Unknown'},
        'year': target_year,
        'month': month,
        'bookings': formatted_bookings,
        'total_commission': total_commission,
        'booking_count': len(formatted_bookings)
    }

# User Management Routes
@api_router.get("/users", response_model=List[UserResponse])
async def get_users(current_user: UserResponse = Depends(get_current_active_admin)):
    """Get all users (Admin only)"""
    users = await db.users.find().to_list(1000)
    return [UserResponse(**user) for user in users]

@api_router.post("/users", response_model=UserResponse)
async def create_user(user: UserCreate, current_user: UserResponse = Depends(get_current_active_admin)):
    """Create a new user (Admin only)"""
    # Check if username already exists
    existing_user = await db.users.find_one({"username": user.username})
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # Validate email is provided
    if not user.email or not user.email.strip():
        raise HTTPException(status_code=400, detail="Email is required for password recovery")
    
    # Check if email already exists
    existing_email = await db.users.find_one({"email": user.email})
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already in use by another user")
    
    # Hash password
    hashed_password = get_password_hash(user.password)
    
    # Admin always has all permissions (empty list means all)
    # For other roles, use provided permissions
    page_permissions = [] if user.role == "Admin" else user.page_permissions
    
    user_obj = User(
        username=user.username,
        password_hash=hashed_password,
        full_name=user.full_name,
        role=user.role,
        email=user.email,
        page_permissions=page_permissions
    )
    user_dict = user_obj.dict()
    await db.users.insert_one(user_dict)
    
    # Log activity
    await log_activity(
        action="user_created",
        description=f"New user '{user.username}' created with role '{user.role}'",
        user_name=current_user.username,
        entity_type="user",
        entity_id=user_obj.id
    )
    
    return UserResponse(**user_dict)

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: UserResponse = Depends(get_current_active_admin)):
    """Delete a user (Admin only)"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent deleting admin user
    if user.get("username") == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete admin user")
    
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Log activity
    await log_activity(
        action="user_deleted",
        description=f"User '{user.get('username', 'Unknown')}' deleted",
        user_name=current_user.username,
        entity_type="user",
        entity_id=user_id
    )
    
    return {"message": "User deleted successfully"}

@api_router.put("/users/{user_id}/toggle-status")
async def toggle_user_status(user_id: str, current_user: UserResponse = Depends(get_current_active_admin)):
    """Toggle user active/inactive status (Admin only)"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent deactivating admin user
    if user.get("username") == "admin":
        raise HTTPException(status_code=400, detail="Cannot deactivate admin user")
    
    new_status = not user.get('is_active', True)
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {"is_active": new_status}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Log activity
    await log_activity(
        action="user_status_changed",
        description=f"User '{user.get('username', 'Unknown')}' {'activated' if new_status else 'deactivated'}",
        user_name=current_user.username,
        entity_type="user",
        entity_id=user_id
    )
    
    return {"message": f"User {'activated' if new_status else 'deactivated'} successfully"}

@api_router.get("/users/available-pages")
async def get_available_pages():
    """Get list of available pages for role-based access control"""
    pages = [
        {"id": "dashboard", "name": "Dashboard", "description": "Main dashboard view"},
        {"id": "calendar", "name": "Calendar", "description": "Booking calendar view"},
        {"id": "restaurant", "name": "Restaurant", "description": "Restaurant orders and management"},
        {"id": "rooms", "name": "Rooms", "description": "Room management"},
        {"id": "guests", "name": "Guests", "description": "Guest management"},
        {"id": "bookings", "name": "Bookings", "description": "Booking management"},
        {"id": "income_expense", "name": "Income/Expense", "description": "Income and expense tracking"},
        {"id": "expenses", "name": "Expenses", "description": "Expense management"},
        {"id": "stocks", "name": "Stock Management", "description": "Inventory and stock tracking"},
        {"id": "commissions", "name": "Commissions", "description": "Commission tracking"},
        {"id": "payroll", "name": "Payroll", "description": "Employee payroll management"},
        {"id": "maintenance", "name": "Maintenance", "description": "Room maintenance tracking"},
        {"id": "settings", "name": "Settings", "description": "System settings"},
        {"id": "feedback", "name": "Guest Feedback", "description": "Guest ratings and reviews"}
    ]
    return pages

@api_router.put("/users/{user_id}/permissions")
async def update_user_permissions(user_id: str, permissions: List[str], current_user: UserResponse = Depends(get_current_active_admin)):
    """Update user page permissions (Admin only)"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent modifying admin user permissions
    if user.get("username") == "admin":
        raise HTTPException(status_code=400, detail="Cannot modify admin user permissions")
    
    # Admin role always has all permissions
    if user.get("role") == "Admin":
        raise HTTPException(status_code=400, detail="Admin role always has all permissions")
    
    # Validate permissions
    valid_pages = [p["id"] for p in await get_available_pages()]
    invalid_permissions = [p for p in permissions if p not in valid_pages]
    if invalid_permissions:
        raise HTTPException(status_code=400, detail=f"Invalid permissions: {invalid_permissions}")
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"page_permissions": permissions}}
    )
    
    # Log activity
    await log_activity(
        action="user_permissions_updated",
        description=f"Permissions updated for user '{user.get('username', 'Unknown')}'",
        user_name=current_user.username,
        entity_type="user",
        entity_id=user_id
    )
    
    return {"message": "User permissions updated successfully"}

# Settings Management Routes
@api_router.get("/settings")
async def get_settings(current_user: UserResponse = Depends(get_current_user)):
    """Get hotel settings"""
    settings = await db.settings.find_one()
    if not settings:
        # Create default settings if none exist
        default_settings = Settings()
        await db.settings.insert_one(default_settings.dict())
        return default_settings
    return Settings(**settings)

@api_router.put("/settings")
async def update_settings(
    settings_update: SettingsUpdate,
    current_user: UserResponse = Depends(get_current_active_admin)
):
    """Update hotel settings (Admin only)"""
    # Get current settings or create default
    current_settings = await db.settings.find_one()
    if not current_settings:
        current_settings = Settings().dict()
        await db.settings.insert_one(current_settings)
    
    # Update only provided fields
    update_data = {k: v for k, v in settings_update.dict().items() if v is not None}
    update_data['updated_at'] = datetime.utcnow()
    update_data['updated_by'] = current_user.username
    
    result = await db.settings.update_one(
        {"id": current_settings.get('id', current_settings.get('_id'))},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        # If no match, create new settings
        new_settings = Settings(**update_data)
        await db.settings.insert_one(new_settings.dict())
    
    # Log activity
    updated_fields = list(update_data.keys())
    await log_activity(
        action="settings_updated",
        description=f"Hotel settings updated: {', '.join(updated_fields)}",
        user_name=current_user.username,
        entity_type="settings",
        details=update_data
    )
    
    return {"message": "Settings updated successfully"}

# Activity Log Routes
@api_router.get("/activity-logs")
async def get_activity_logs(
    page: int = 1,
    limit: int = 50,
    action: str = "",
    user_name: str = "",
    entity_type: str = "",
    current_user: UserResponse = Depends(get_current_user)
):
    """Get activity logs with pagination and filtering"""
    skip = (page - 1) * limit
    
    # Build query
    query = {}
    if action:
        query["action"] = {"$regex": action, "$options": "i"}
    if user_name:
        query["user_name"] = {"$regex": user_name, "$options": "i"}
    if entity_type:
        query["entity_type"] = entity_type
    
    # Get total count for pagination
    total_count = await db.activity_logs.count_documents(query)
    
    # Get logs with pagination
    logs = await db.activity_logs.find(query).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)
    
    return {
        "logs": [ActivityLog(**log) for log in logs],
        "total_count": total_count,
        "page": page,
        "limit": limit,
        "total_pages": (total_count + limit - 1) // limit
    }

@api_router.post("/activity-logs")
async def create_activity_log(log: ActivityLogCreate, current_user: UserResponse = Depends(get_current_user)):
    """Create a new activity log entry"""
    activity = ActivityLog(**log.dict())
    await db.activity_logs.insert_one(activity.dict())
    return {"message": "Activity logged successfully"}

# Room Management Routes
@api_router.get("/rooms", response_model=List[Room])
async def get_rooms():
    rooms = await db.rooms.find().to_list(1000)
    
    # Convert datetime back to date for response
    for room in rooms:
        if isinstance(room.get('check_in_date'), datetime):
            room['check_in_date'] = room['check_in_date'].date()
        if isinstance(room.get('check_out_date'), datetime):
            room['check_out_date'] = room['check_out_date'].date()
    
    return [Room(**room) for room in rooms]

@api_router.post("/rooms", response_model=Room)
async def create_room(room: RoomCreate):
    room_dict = room.dict()
    room_obj = Room(**room_dict, status="Available")
    await db.rooms.insert_one(room_obj.dict())
    return room_obj

@api_router.post("/rooms/bulk")
async def create_bulk_rooms(bulk_room: BulkRoomCreate):
    """Create multiple rooms at once with a room number range"""
    created_rooms = []
    skipped_rooms = []
    
    for num in range(bulk_room.start_number, bulk_room.end_number + 1):
        room_number = f"{bulk_room.room_prefix}{str(num).zfill(2)}"
        
        # Check if room already exists
        existing = await db.rooms.find_one({"room_number": room_number})
        if existing:
            skipped_rooms.append(room_number)
            continue
        
        room_obj = Room(
            room_number=room_number,
            room_type=bulk_room.room_type,
            price_per_night=bulk_room.price_per_night,
            max_occupancy=bulk_room.max_occupancy,
            amenities=bulk_room.amenities,
            status="Available"
        )
        await db.rooms.insert_one(room_obj.dict())
        created_rooms.append(room_number)
    
    return {
        "message": f"Created {len(created_rooms)} rooms",
        "created_rooms": created_rooms,
        "skipped_rooms": skipped_rooms
    }

@api_router.put("/rooms/{room_id}")
async def update_room(room_id: str, room: RoomCreate):
    room_dict = room.dict()
    result = await db.rooms.update_one({"id": room_id}, {"$set": room_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"message": "Room updated successfully"}

@api_router.delete("/rooms/{room_id}")
async def delete_room(room_id: str):
    result = await db.rooms.delete_one({"id": room_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"message": "Room deleted successfully"}

@api_router.put("/rooms/{room_id}/status")
async def update_room_status(room_id: str, status: str, guest_name: Optional[str] = None, check_in_date: Optional[date] = None, check_out_date: Optional[date] = None):
    update_data = {"status": status}
    if guest_name:
        update_data["current_guest"] = guest_name
    if check_in_date:
        update_data["check_in_date"] = check_in_date
    if check_out_date:
        update_data["check_out_date"] = check_out_date
    
    result = await db.rooms.update_one({"id": room_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"message": "Room status updated successfully"}

@api_router.get("/rooms/{room_id}")
async def get_room(room_id: str):
    room = await db.rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    # Convert datetime back to date for response
    if isinstance(room.get('check_in_date'), datetime):
        room['check_in_date'] = room['check_in_date'].date()
    if isinstance(room.get('check_out_date'), datetime):
        room['check_out_date'] = room['check_out_date'].date()
    
    return Room(**room)

# ==================== CLEANING STAFF & ROOM CLEANING MANAGEMENT ====================

@api_router.get("/cleaning/staff")
async def get_cleaning_staff():
    """Get all cleaning staff members"""
    staff = await db.cleaning_staff.find({"is_active": True}, {"_id": 0}).to_list(100)
    return staff

@api_router.post("/cleaning/staff")
async def create_cleaning_staff(name: str, phone: str = ""):
    """Add a new cleaning staff member"""
    staff = CleaningStaff(name=name, phone=phone)
    await db.cleaning_staff.insert_one(staff.dict())
    return {"message": "Staff member added", "staff": staff.dict()}

@api_router.delete("/cleaning/staff/{staff_id}")
async def delete_cleaning_staff(staff_id: str):
    """Remove a cleaning staff member"""
    result = await db.cleaning_staff.update_one(
        {"id": staff_id},
        {"$set": {"is_active": False}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Staff not found")
    return {"message": "Staff member removed"}

@api_router.get("/cleaning/pending")
async def get_rooms_pending_cleaning():
    """Get all rooms that need cleaning"""
    rooms = await db.rooms.find({"status": "Pending Cleaning"}, {"_id": 0}).to_list(100)
    
    # Get active assignments for these rooms
    room_numbers = [r["room_number"] for r in rooms]
    assignments = await db.cleaning_assignments.find({
        "room_number": {"$in": room_numbers},
        "status": "Assigned"
    }, {"_id": 0}).to_list(100)
    
    # Map assignments to rooms
    assignment_map = {a["room_number"]: a for a in assignments}
    
    result = []
    for room in rooms:
        room_data = {
            "room_number": room["room_number"],
            "room_type": room.get("room_type", ""),
            "last_guest": room.get("last_guest", "Unknown"),
            "assignment": assignment_map.get(room["room_number"])
        }
        result.append(room_data)
    
    return result

@api_router.post("/cleaning/assign")
async def assign_cleaning_staff(room_number: str, staff_id: str):
    """Assign a cleaning staff member to a room"""
    # Verify room exists and needs cleaning
    room = await db.rooms.find_one({"room_number": room_number})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room.get("status") != "Pending Cleaning":
        raise HTTPException(status_code=400, detail="Room does not need cleaning")
    
    # Verify staff exists
    staff = await db.cleaning_staff.find_one({"id": staff_id, "is_active": True})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    
    # Check if already assigned
    existing = await db.cleaning_assignments.find_one({
        "room_number": room_number,
        "status": "Assigned"
    })
    if existing:
        # Update existing assignment
        await db.cleaning_assignments.update_one(
            {"id": existing["id"]},
            {"$set": {"staff_id": staff_id, "staff_name": staff["name"], "assigned_at": datetime.now()}}
        )
    else:
        # Create new assignment
        assignment = CleaningAssignment(
            room_number=room_number,
            staff_id=staff_id,
            staff_name=staff["name"],
            previous_guest=room.get("last_guest", "Unknown")
        )
        await db.cleaning_assignments.insert_one(assignment.dict())
    
    # Send SMS notification to cleaning staff
    try:
        if staff.get("phone"):
            notification_data = {
                "phone": staff.get("phone"),
                "staff_name": staff.get("name"),
                "room_number": room_number,
                "guest_name": room.get("last_guest", "Unknown")
            }
            await send_booking_notification_sms(notification_data, "cleaning_assigned")
    except Exception as e:
        print(f"Cleaning assignment notification error (non-critical): {str(e)}")
    
    return {"message": f"Room {room_number} assigned to {staff['name']}"}

@api_router.post("/cleaning/complete/{room_number}")
async def mark_room_cleaned(room_number: str):
    """Mark a room as cleaned and available"""
    # Verify room exists and is pending cleaning
    room = await db.rooms.find_one({"room_number": room_number})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room.get("status") != "Pending Cleaning":
        raise HTTPException(status_code=400, detail="Room is not pending cleaning")
    
    # Update room status to Available
    await db.rooms.update_one(
        {"room_number": room_number},
        {"$set": {"status": "Available", "last_guest": None}}
    )
    
    # Mark assignment as completed if exists
    await db.cleaning_assignments.update_one(
        {"room_number": room_number, "status": "Assigned"},
        {"$set": {"status": "Completed", "completed_at": datetime.now()}}
    )
    
    return {"message": f"Room {room_number} is now available"}

# ==================== END CLEANING MANAGEMENT ====================

@api_router.get("/rooms/availability/check")
async def check_room_availability(
    check_in_date: str,
    check_out_date: str
):
    """
    Check room availability for specific date range
    Returns list of available rooms with their details
    """
    try:
        # Parse date strings
        check_in = datetime.strptime(check_in_date, '%Y-%m-%d').date()
        check_out = datetime.strptime(check_out_date, '%Y-%m-%d').date()
        
        # Validate dates
        if check_in >= check_out:
            raise HTTPException(status_code=400, detail="Check-out date must be after check-in date")
        
        # Get all rooms
        all_rooms = await db.rooms.find().to_list(1000)
        
        # Find conflicting bookings — handle both string and datetime date formats
        all_bookings = await db.bookings.find({
            "status": {"$in": ["Upcoming", "Confirmed", "Checked-in", "Checked In"]}
        }, {"room_number": 1, "check_in_date": 1, "check_out_date": 1, "_id": 0}).to_list(5000)
        
        booked_room_numbers = set()
        for booking in all_bookings:
            bci = booking.get("check_in_date")
            bco = booking.get("check_out_date")
            # Normalise to date objects
            if isinstance(bci, str):
                try: bci = datetime.strptime(bci[:10], "%Y-%m-%d").date()
                except (ValueError, TypeError): continue
            elif isinstance(bci, datetime):
                bci = bci.date()
            else:
                continue
            if isinstance(bco, str):
                try: bco = datetime.strptime(bco[:10], "%Y-%m-%d").date()
                except (ValueError, TypeError): continue
            elif isinstance(bco, datetime):
                bco = bco.date()
            else:
                continue
            # Overlap check: bci < check_out AND bco > check_in
            if bci < check_out and bco > check_in:
                booked_room_numbers.add(booking.get("room_number"))
        
        # Filter available rooms
        available_rooms = []
        for room in all_rooms:
            if room['room_number'] not in booked_room_numbers:
                # Remove MongoDB ObjectId field and convert datetime to date
                room_data = {k: v for k, v in room.items() if k != '_id'}
                if isinstance(room_data.get('check_in_date'), datetime):
                    room_data['check_in_date'] = room_data['check_in_date'].date()
                if isinstance(room_data.get('check_out_date'), datetime):
                    room_data['check_out_date'] = room_data['check_out_date'].date()
                if isinstance(room_data.get('created_at'), datetime):
                    room_data['created_at'] = room_data['created_at'].isoformat()
                available_rooms.append(room_data)
        
        # Calculate stay duration for pricing
        stay_duration = (check_out - check_in).days
        
        return {
            "check_in_date": check_in_date,
            "check_out_date": check_out_date,
            "stay_duration": stay_duration,
            "total_rooms": len(all_rooms),
            "available_rooms": len(available_rooms),
            "rooms": available_rooms
        }
        
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    except HTTPException:
        raise  # Re-raise HTTPException as-is to preserve status codes
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error checking availability: {str(e)}")

# Booking Management Routes
@api_router.get("/bookings")
async def get_bookings(
    page: int = 1,
    limit: int = 20,
    search: str = "",
    status: str = ""
):
    """
    Get bookings with pagination and search functionality
    """
    skip = (page - 1) * limit
    
    # Build search query
    query = {}
    
    if search:
        # Search in guest name, email, phone, or room number
        # Handle null values by also checking for field existence
        query["$or"] = [
            {"guest_name": {"$regex": search, "$options": "i"}},
            {"$and": [
                {"guest_email": {"$exists": True, "$nin": [None, ""]}},
                {"guest_email": {"$regex": search, "$options": "i"}}
            ]},
            {"$and": [
                {"guest_phone": {"$exists": True, "$nin": [None, ""]}},
                {"guest_phone": {"$regex": search, "$options": "i"}}
            ]},
            {"room_number": {"$regex": search, "$options": "i"}}
        ]
    
    if status:
        query["status"] = status
    
    # Get total count for pagination
    total_count = await db.bookings.count_documents(query)
    
    # Get bookings with pagination - exclude large proof field
    proof_exclude = {"_id": 0, "guest_id_proof": 0}
    bookings = await db.bookings.find(query, proof_exclude).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Convert datetime back to date for response
    for booking in bookings:
        if isinstance(booking.get('check_in_date'), datetime):
            booking['check_in_date'] = booking['check_in_date'].date()
        if isinstance(booking.get('check_out_date'), datetime):
            booking['check_out_date'] = booking['check_out_date'].date()
    
    return {
        "bookings": [Booking(**booking) for booking in bookings],
        "total_count": total_count,
        "page": page,
        "limit": limit,
        "total_pages": (total_count + limit - 1) // limit
    }

@api_router.get("/bookings/download")
async def download_bookings(
    start_date: str = "",
    end_date: str = "",
    status: str = ""
):
    """
    Download bookings data as CSV
    """
    query = {}
    
    # Filter by date range if provided
    if start_date and end_date:
        try:
            start_datetime = datetime.combine(datetime.strptime(start_date, '%Y-%m-%d').date(), datetime.min.time())
            end_datetime = datetime.combine(datetime.strptime(end_date, '%Y-%m-%d').date(), datetime.max.time())
            query["created_at"] = {"$gte": start_datetime, "$lte": end_datetime}
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    # Filter by status if provided
    if status:
        query["status"] = status
    
    # Get all bookings matching the criteria
    bookings = await db.bookings.find(query).sort("created_at", -1).to_list(None)
    
    # Convert to CSV format
    csv_data = []
    headers = [
        "Guest Name", "Email", "Phone", "ID/Passport", "Country", 
        "Room Number", "Check-in Date", "Check-out Date", "Stay Type",
        "Booking Amount", "Status", "Created At", "Additional Notes"
    ]
    csv_data.append(headers)
    
    for booking in bookings:
        # Convert datetime back to date for CSV
        check_in_date = booking.get('check_in_date')
        check_out_date = booking.get('check_out_date')
        created_at = booking.get('created_at')
        
        if isinstance(check_in_date, datetime):
            check_in_date = check_in_date.date()
        if isinstance(check_out_date, datetime):
            check_out_date = check_out_date.date()
        if isinstance(created_at, datetime):
            created_at = created_at.strftime('%Y-%m-%d %H:%M:%S')
        
        row = [
            booking.get('guest_name', ''),
            booking.get('guest_email', ''),
            booking.get('guest_phone', ''),
            booking.get('guest_id_passport', ''),
            booking.get('guest_country', ''),
            booking.get('room_number', ''),
            str(check_in_date) if check_in_date else '',
            str(check_out_date) if check_out_date else '',
            booking.get('stay_type', ''),
            booking.get('booking_amount', 0),
            booking.get('status', ''),
            created_at,
            booking.get('additional_notes', '')
        ]
        csv_data.append(row)
    
    return {
        "data": csv_data,
        "filename": f"bookings_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    }

@api_router.get("/bookings/upcoming", response_model=List[Booking])
async def get_upcoming_bookings():
    """Get all bookings with 'Upcoming' status - regardless of check-in date.
    Bookings remain 'Upcoming' until checked in or cancelled."""
    bookings = await db.bookings.find({
        "status": "Upcoming"
    }, {"_id": 0, "guest_id_proof": 0}).sort("check_in_date", 1).to_list(100)
    
    # Convert datetime back to date for response
    for booking in bookings:
        if isinstance(booking.get('check_in_date'), datetime):
            booking['check_in_date'] = booking['check_in_date'].date()
        if isinstance(booking.get('check_out_date'), datetime):
            booking['check_out_date'] = booking['check_out_date'].date()
    
    return [Booking(**booking) for booking in bookings]

@api_router.post("/bookings", response_model=Booking)
async def create_booking(booking: BookingCreate, current_user: UserResponse = Depends(get_current_user)):
    booking_dict = booking.dict()
    
    # Validate booking channel if provided
    if booking_dict.get('booking_channel_id'):
        channel = await db.booking_channels.find_one({"id": booking_dict['booking_channel_id']})
        if not channel:
            raise HTTPException(status_code=400, detail="Invalid booking channel")
        if not channel.get('is_active', True):
            raise HTTPException(status_code=400, detail="Booking channel is inactive")
        # Update channel name from database
        booking_dict['booking_channel_name'] = channel['channel_name']
    else:
        # Default to Direct booking if no channel specified
        booking_dict['booking_channel_name'] = "Direct"
    
    # Convert date strings to date objects for processing
    if isinstance(booking_dict.get('check_in_date'), str):
        booking_dict['check_in_date'] = datetime.strptime(booking_dict['check_in_date'], '%Y-%m-%d').date()
    
    # Handle short time stays - set checkout date to same day
    if booking_dict.get('stay_type') == 'Short Time':
        booking_dict['check_out_date'] = booking_dict['check_in_date']
    else:
        # Handle night stay checkout dates
        if booking_dict.get('check_out_date'):
            if isinstance(booking_dict.get('check_out_date'), str):
                booking_dict['check_out_date'] = datetime.strptime(booking_dict['check_out_date'], '%Y-%m-%d').date()
        else:
            # Default to same day if no checkout date provided
            booking_dict['check_out_date'] = booking_dict['check_in_date']
    
    # Validate room availability before creating booking
    is_available, availability_error = await check_room_availability_for_booking(
        room_number=booking.room_number,
        check_in_date=booking_dict['check_in_date'],
        check_out_date=booking_dict['check_out_date']
    )
    
    if not is_available:
        raise HTTPException(status_code=400, detail=availability_error)
    
    
    # Use the provided booking_status, default to "Upcoming"
    final_status = booking_dict.get('booking_status', 'Upcoming')
    booking_obj = Booking(**booking_dict, status=final_status)
    
    # Convert date objects to datetime for MongoDB storage
    booking_storage = booking_obj.dict()
    if booking_storage.get('check_in_date'):
        booking_storage['check_in_date'] = datetime.combine(booking_storage['check_in_date'], datetime.min.time())
    if booking_storage.get('check_out_date'):
        booking_storage['check_out_date'] = datetime.combine(booking_storage['check_out_date'], datetime.min.time())
    
    await db.bookings.insert_one(booking_storage)
    
    # Record advance payment to Room Bookings Income if present
    if booking.advance_amount > 0:
        advance_sale = DailySale(
            date=datetime.combine(datetime.now().date(), datetime.min.time()),
            customer_name=booking.guest_name,
            room_number=booking.room_number,
            room_charges=0.0,  # No room charges yet - this is just advance
            additional_charges=0.0,
            discount_amount=0.0,
            advance_amount=booking.advance_amount,
            total_amount=booking.advance_amount,
            payment_method=booking.advance_payment_method
        )
        advance_storage = advance_sale.dict()
        advance_storage.pop("_id", None)
        # Add extra fields for tracking
        advance_storage["booking_id"] = booking_obj.id
        advance_storage["sale_type"] = "room_booking_advance"
        if isinstance(advance_storage.get("date"), date) and not isinstance(advance_storage.get("date"), datetime):
            advance_storage["date"] = datetime.combine(advance_storage["date"], datetime.min.time())
        await db.daily_sales.insert_one(advance_storage)
    
    # If booking status is "Checked In", also create a customer record
    if final_status == "Checked In":
        customer_data = {
            "name": booking.guest_name,
            "email": booking.guest_email,
            "phone": booking.guest_phone,
            "current_room": booking.room_number,
            "check_in_date": booking_dict['check_in_date'],
            "check_out_date": booking_dict['check_out_date'],  # Keep planned checkout date
            "advance_amount": 0.0,  # No advance amount for past date check-ins
            "notes": booking.additional_notes,
            "room_charges": booking.booking_amount,
            "additional_charges": 0.0,
            "total_amount": booking.booking_amount,
            "is_checked_out": False,  # Currently checked in
            "actual_checkout_date": None  # No actual checkout yet
        }
        
        customer_obj = Customer(**customer_data)
        customer_storage = customer_obj.dict()
        
        # Convert date objects to datetime for MongoDB storage
        if customer_storage.get('check_in_date'):
            customer_storage['check_in_date'] = datetime.combine(customer_storage['check_in_date'], datetime.min.time())
        if customer_storage.get('check_out_date'):
            customer_storage['check_out_date'] = datetime.combine(customer_storage['check_out_date'], datetime.min.time())
        if customer_storage.get('actual_checkout_date'):
            customer_storage['actual_checkout_date'] = datetime.combine(customer_storage['actual_checkout_date'], datetime.min.time())
        
        await db.customers.insert_one(customer_storage)
        
        # Update room status to Occupied
        await db.rooms.update_one(
            {"room_number": booking.room_number},
            {"$set": {
                "status": "Occupied",
                "current_guest": booking.guest_name,
                "check_in_date": datetime.combine(booking_dict['check_in_date'], datetime.min.time()),
                "check_out_date": datetime.combine(booking_dict['check_out_date'], datetime.min.time())
            }}
        )
    
    # Log activity
    await log_activity(
        action="booking_created",
        description=f"New booking created for {booking.guest_name} in room {booking.room_number} via {booking_dict['booking_channel_name']} (Status: {final_status})",
        user_name=current_user.username,
        entity_type="booking",
        entity_id=booking_obj.id,
        details={
            "guest_name": booking.guest_name,
            "room_number": booking.room_number,
            "booking_amount": booking.booking_amount,
            "stay_type": booking.stay_type,
            "booking_channel": booking_dict['booking_channel_name'],
            "booking_status": final_status
        }
    )
    
    # Send SMS and Email notification for reservation (non-blocking)
    try:
        notification_data = {
            "guest_name": booking.guest_name,
            "guest_email": booking.guest_email,
            "guest_phone": booking.guest_phone,
            "room_number": booking.room_number,
            "check_in_date": booking_dict['check_in_date'],
            "check_out_date": booking_dict['check_out_date'],
            "booking_amount": booking.booking_amount
        }
        # Determine which occasion to use based on status
        if final_status == "Checked In":
            await send_notifications(notification_data, "checkin")
        else:
            await send_notifications(notification_data, "reservation")
    except Exception as e:
        # Don't fail the booking if notification fails
        print(f"Booking notification error (non-critical): {str(e)}")
    
    return booking_obj

@api_router.put("/bookings/{booking_id}")
async def update_booking(
    booking_id: str, 
    booking_update: BookingUpdate, 
    current_user: UserResponse = Depends(get_current_user)
):
    """Update booking details - allows room changes only for upcoming bookings"""
    # Get the current booking
    current_booking = await db.bookings.find_one({"id": booking_id})
    if not current_booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    # Check if booking can be modified
    booking_status = current_booking.get('status', 'Upcoming')
    
    # Allow different types of modifications based on status
    if booking_status == 'Upcoming':
        # Upcoming bookings can be fully modified
        can_modify_room = True
        can_modify_dates = True
        can_modify_guest_info = True
    elif booking_status in ['Checked-in', 'Checked In']:
        # Checked-in bookings can only have dates extended (not shortened) and guest info updated
        can_modify_room = False  # Can't change room for checked-in guests
        can_modify_dates = True  # Can extend dates
        can_modify_guest_info = True  # Can update guest information
    else:
        # Other statuses (Cancelled, Completed) cannot be modified
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot modify booking with status '{booking_status}'. Only 'Upcoming' and 'Checked-in' bookings can be modified."
        )
    
    update_data = {}
    changes_made = []
    
    # Handle room number change with availability validation
    if booking_update.room_number is not None:
        if not can_modify_room:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot change room for booking with status '{booking_status}'. Room changes are only allowed for 'Upcoming' bookings."
            )
            
        new_room = booking_update.room_number
        current_room = current_booking.get('room_number')
        
        if new_room != current_room:
            # Check if new room is available for the booking dates
            check_in = current_booking.get('check_in_date')
            check_out = current_booking.get('check_out_date')
            
            if isinstance(check_in, datetime):
                check_in_date = check_in.date()
            else:
                check_in_date = check_in
                
            if isinstance(check_out, datetime):
                check_out_date = check_out.date()
            else:
                check_out_date = check_out
            
            # Check for conflicting bookings in the new room (excluding current booking)
            conflicting_bookings = await db.bookings.find({
                "room_number": new_room,
                "id": {"$ne": booking_id},  # Exclude current booking
                "status": {"$in": ["Upcoming", "Checked In"]},
                "$or": [
                    {
                        "check_in_date": {"$lte": datetime.combine(check_out_date, datetime.min.time())},
                        "check_out_date": {"$gte": datetime.combine(check_in_date, datetime.min.time())}
                    }
                ]
            }).to_list(100)
            
            if conflicting_bookings:
                conflicting_guest = conflicting_bookings[0].get('guest_name', 'Unknown')
                conflicting_dates = f"{conflicting_bookings[0].get('check_in_date', '').strftime('%Y-%m-%d') if conflicting_bookings[0].get('check_in_date') else 'N/A'} to {conflicting_bookings[0].get('check_out_date', '').strftime('%Y-%m-%d') if conflicting_bookings[0].get('check_out_date') else 'N/A'}"
                raise HTTPException(
                    status_code=400, 
                    detail=f"Room {new_room} is not available for the requested dates. Conflict with booking for {conflicting_guest} ({conflicting_dates})"
                )
            
            update_data['room_number'] = new_room
            changes_made.append(f"Room changed from {current_room} to {new_room}")
    
    # Handle other updates
    if booking_update.check_in_date is not None:
        update_data['check_in_date'] = datetime.combine(booking_update.check_in_date, datetime.min.time())
        changes_made.append(f"Check-in date updated to {booking_update.check_in_date}")
        
    if booking_update.check_out_date is not None:
        update_data['check_out_date'] = datetime.combine(booking_update.check_out_date, datetime.min.time())
        changes_made.append(f"Check-out date updated to {booking_update.check_out_date}")
        
    if booking_update.additional_notes is not None:
        update_data['additional_notes'] = booking_update.additional_notes
        changes_made.append("Notes updated")
    
    # Recalculate booking amount if dates have changed
    if booking_update.check_in_date is not None or booking_update.check_out_date is not None:
        if not can_modify_dates:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot modify dates for booking with status '{booking_status}'."
            )
        
        # Get current and new dates
        current_check_in = current_booking.get('check_in_date')
        current_check_out = current_booking.get('check_out_date')
        
        # Convert current dates to date objects if they're datetime
        if isinstance(current_check_in, datetime):
            current_check_in = current_check_in.date()
        if isinstance(current_check_out, datetime):
            current_check_out = current_check_out.date()
        
        # Use new dates if provided, otherwise use current ones
        new_check_in = booking_update.check_in_date if booking_update.check_in_date is not None else current_check_in
        new_check_out = booking_update.check_out_date if booking_update.check_out_date is not None else current_check_out
        
        # Get the room number (use new room if changed, otherwise current room)
        room_number = update_data.get('room_number', current_booking.get('room_number'))
        
        # Check for booking conflicts with the new dates
        is_available, conflict_error = await check_room_availability_for_booking(
            room_number=room_number,
            check_in_date=new_check_in,
            check_out_date=new_check_out,
            exclude_booking_id=booking_id,  # Exclude the current booking being edited
            skip_occupied_check=(booking_status in ['Checked-in', 'Checked In'])  # Skip for checked-in guests
        )
        
        if not is_available:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot update booking dates: {conflict_error}"
            )
        
        # Special validation for checked-in bookings
        if booking_status in ['Checked-in', 'Checked In']:
            # For checked-in bookings, only allow extending checkout date
            if booking_update.check_in_date is not None and booking_update.check_in_date != current_check_in:
                raise HTTPException(
                    status_code=400, 
                    detail="Cannot change check-in date for checked-in bookings. Guest is already checked in."
                )
            
            # Only allow extending checkout date (not shortening)
            if booking_update.check_out_date is not None and booking_update.check_out_date < current_check_out:
                raise HTTPException(
                    status_code=400, 
                    detail="Cannot shorten checkout date for checked-in bookings. Only extensions are allowed."
                )
        
        # Calculate the booking's original rate per night (not room's default rate)
        current_amount = current_booking.get('booking_amount', 0.0)
        original_nights = (current_check_out - current_check_in).days
        if original_nights < 1:
            original_nights = 1
        
        # Use the booking's original rate per night
        booking_rate_per_night = current_amount / original_nights if original_nights > 0 else 0.0
        
        # Recalculate stay_type based on new dates
        if new_check_in == new_check_out:
            # Same day = Short Time
            stay_type = 'Short Time'
            new_booking_amount = booking_rate_per_night * 0.5
        else:
            # Different days = Night Stay
            stay_type = 'Night Stay'
            nights = (new_check_out - new_check_in).days
            if nights <= 0:
                nights = 1  # Minimum 1 night
            new_booking_amount = booking_rate_per_night * nights
        
        # Update stay_type if it has changed
        current_stay_type = current_booking.get('stay_type', 'Night Stay')
        if stay_type != current_stay_type:
            update_data['stay_type'] = stay_type
            changes_made.append(f"Stay type updated from {current_stay_type} to {stay_type}")
        
        # Update booking amount if it has changed
        if abs(new_booking_amount - current_amount) > 0.01:  # Use small epsilon for float comparison
            update_data['booking_amount'] = new_booking_amount
            changes_made.append(f"Booking amount updated from {current_amount} to {new_booking_amount} (rate: {booking_rate_per_night}/night)")
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields provided for update")
    
    # Update the booking
    result = await db.bookings.update_one({"id": booking_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    # If the booking is checked in, also update the corresponding customer record
    if current_booking.get('status') == 'Checked In':
        customer_update_data = {}
        
        # Update customer record with new dates if they changed
        if 'check_in_date' in update_data:
            customer_update_data['check_in_date'] = update_data['check_in_date']
        if 'check_out_date' in update_data:
            customer_update_data['check_out_date'] = update_data['check_out_date']
        if 'booking_amount' in update_data:
            customer_update_data['room_charges'] = update_data['booking_amount']
            customer_update_data['total_amount'] = update_data['booking_amount']  # Recalculate total
        
        if customer_update_data:
            # Find and update customer record based on booking details
            await db.customers.update_one(
                {
                    "name": current_booking.get('guest_name'),
                    "current_room": current_booking.get('room_number')
                },
                {"$set": customer_update_data}
            )
            changes_made.append("Customer record updated")
    
    # Log activity
    await log_activity(
        action="booking_updated",
        description=f"Booking for {current_booking.get('guest_name', 'Unknown')} updated: {', '.join(changes_made)}",
        user_name=current_user.username,
        entity_type="booking",
        entity_id=booking_id,
        details={
            "changes": changes_made,
            "guest_name": current_booking.get('guest_name'),
            "old_room": current_booking.get('room_number'),
            "new_room": update_data.get('room_number', current_booking.get('room_number'))
        }
    )
    
    return {
        "message": "Booking updated successfully",
        "changes": changes_made
    }

# Customer Management Routes
@api_router.post("/migrate-customers")
async def migrate_customers():
    """Migrate existing customers to new schema"""
    # Update all customers to have is_checked_out = False if not present
    await db.customers.update_many(
        {"is_checked_out": {"$exists": False}},
        {"$set": {"is_checked_out": False, "actual_checkout_date": None}}
    )
    
    # Fix any customers that have check_out_date = None (from previous logic)
    customers_with_null_checkout = await db.customers.find({"check_out_date": None}).to_list(1000)
    
    for customer in customers_with_null_checkout:
        # Find the corresponding booking to get the planned checkout date
        booking = await db.bookings.find_one({
            "guest_name": customer["name"],
            "room_number": customer["current_room"]
        })
        
        if booking and booking.get("check_out_date"):
            planned_checkout = booking["check_out_date"]
            if isinstance(planned_checkout, datetime):
                planned_checkout = planned_checkout.date()
            
            await db.customers.update_one(
                {"id": customer["id"]},
                {"$set": {"check_out_date": datetime.combine(planned_checkout, datetime.min.time())}}
            )
    
    return {"message": "Customer migration completed"}

@api_router.get("/customers/checked-in")
async def get_checked_in_customers():
    # Get only customers who are currently checked in (is_checked_out = False)
    customers = await db.customers.find({
        "is_checked_out": False  # Only customers who haven't checked out
    }).to_list(1000)
    
    result = []
    for customer in customers:
        # Convert datetime back to date for response
        check_in_date = customer.get('check_in_date')
        check_out_date = customer.get('check_out_date')
        
        if check_in_date:
            check_in_date = check_in_date.date() if isinstance(check_in_date, datetime) else check_in_date
            customer['check_in_date'] = check_in_date
        if check_out_date:
            check_out_date = check_out_date.date() if isinstance(check_out_date, datetime) else check_out_date
            customer['check_out_date'] = check_out_date
        if customer.get('actual_checkout_date'):
            customer['actual_checkout_date'] = customer['actual_checkout_date'].date() if isinstance(customer['actual_checkout_date'], datetime) else customer['actual_checkout_date']
        
        # Calculate rate per night from the customer's booking
        room_charges = customer.get('room_charges', 0.0)
        if check_in_date and check_out_date:
            nights = (check_out_date - check_in_date).days
            if nights < 1:
                nights = 1
            rate_per_night = room_charges / nights if nights > 0 else 0.0
        else:
            rate_per_night = 0.0
        
        # Create response with rate_per_night added
        customer_data = {
            "id": customer.get('id'),
            "name": customer.get('name'),
            "email": customer.get('email', ''),
            "phone": customer.get('phone', ''),
            "current_room": customer.get('current_room'),
            "check_in_date": str(check_in_date) if check_in_date else None,
            "check_out_date": str(check_out_date) if check_out_date else None,
            "advance_amount": customer.get('advance_amount', 0.0),
            "notes": customer.get('notes', ''),
            "room_charges": room_charges,
            "restaurant_charges": customer.get('restaurant_charges', 0.0),
            "additional_charges": customer.get('additional_charges', 0.0),
            "total_amount": customer.get('total_amount', 0.0),
            "is_checked_out": customer.get('is_checked_out', False),
            "actual_checkout_date": str(customer.get('actual_checkout_date')) if customer.get('actual_checkout_date') else None,
            "created_at": customer.get('created_at'),
            "rate_per_night": rate_per_night  # Added: customer's booked rate per night
        }
        result.append(customer_data)
    
    return result

@api_router.post("/customers", response_model=Customer)
async def create_customer(customer: Customer):
    await db.customers.insert_one(customer.dict())
    return customer

@api_router.post("/checkout")
async def checkout_customer(checkout: CheckoutRequest):
    # Find customer first to get room info
    customer = await db.customers.find_one({"id": checkout.customer_id})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Calculate base amounts
    base_room_charges = customer.get('room_charges', 500.0)  # Default room charge
    restaurant_charges = customer.get('restaurant_charges', 0.0)  # Restaurant charges
    advance_amount = customer.get('advance_amount', 0.0)
    additional_amount = checkout.additional_amount
    discount_amount = checkout.discount_amount
    
    # Calculate subtotal before taxes (room charges + restaurant + additional - discount)
    subtotal = base_room_charges + restaurant_charges + additional_amount - discount_amount
    
    # Calculate booking taxes (applied to room charges + additional charges)
    booking_taxable = base_room_charges + additional_amount - discount_amount
    booking_tax_result = await calculate_booking_taxes(booking_taxable) if booking_taxable > 0 else {"total_tax": 0, "tax_breakdown": []}
    
    # Restaurant taxes are calculated separately when restaurant orders are paid
    # Here we just include the pre-calculated restaurant charges (taxes already applied at order time)
    
    # Total taxes (only booking taxes at checkout - restaurant taxes applied at order time)
    total_taxes = booking_tax_result.get("total_tax", 0)
    
    # Final total (subtotal + taxes - advance)
    total_amount = subtotal + total_taxes - advance_amount
    
    # Tax breakdown
    all_taxes = booking_tax_result.get("tax_breakdown", [])
    
    # Create daily sales record
    daily_sale = DailySale(
        date=datetime.now().date(),
        customer_name=customer.get('name', ''),
        room_number=customer.get('current_room', ''),
        room_charges=base_room_charges,
        additional_charges=restaurant_charges + additional_amount,  # Include restaurant charges
        discount_amount=discount_amount,
        advance_amount=advance_amount,
        total_amount=total_amount,
        payment_method=checkout.payment_method
    )
    
    # Store the daily sale record
    daily_sale_dict = daily_sale.dict()
    daily_sale_dict['date'] = datetime.combine(daily_sale_dict['date'], datetime.min.time())
    daily_sale_dict['taxes'] = total_taxes  # Store tax amount
    daily_sale_dict['tax_breakdown'] = all_taxes  # Store tax details
    await db.daily_sales.insert_one(daily_sale_dict)
    
    # Update customer with final billing details and mark as checked out
    await db.customers.update_one(
        {"id": checkout.customer_id},
        {"$set": {
            "additional_charges": additional_amount,
            "restaurant_charges": restaurant_charges,
            "discount_amount": discount_amount,
            "taxes": total_taxes,
            "tax_breakdown": all_taxes,
            "total_amount": total_amount,
            "is_checked_out": True,  # Mark as checked out
            "actual_checkout_date": datetime.now()  # Set actual checkout date
        }}
    )
    
    # Verify customer was updated
    result = await db.customers.find_one({"id": checkout.customer_id})
    if not result:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Update corresponding booking status to "Completed"
    await db.bookings.update_one(
        {
            "guest_name": customer.get('name'),
            "room_number": customer.get('current_room'),
            "status": {"$in": ["Checked-in", "Checked In"]}
        },
        {"$set": {"status": "Completed"}}
    )
    
    # Update room status to Pending Cleaning (not Available - needs to be cleaned first)
    await db.rooms.update_one(
        {"room_number": customer["current_room"]},
        {"$set": {"status": "Pending Cleaning", "current_guest": None, "check_in_date": None, "check_out_date": None, "last_guest": customer.get("name", "Unknown")}}
    )
    
    # Log activity
    await log_activity(
        action="customer_checked_out",
        description=f"Customer {customer.get('name', 'Unknown')} checked out from room {customer['current_room']}",
        entity_type="checkout",
        entity_id=checkout.customer_id,
        details={
            "guest_name": customer.get("name"),
            "room_number": customer["current_room"],
            "total_amount": total_amount,
            "taxes": total_taxes,
            "payment_method": checkout.payment_method
        }
    )
    
    # Mark all pending restaurant orders for this room as paid
    await db.restaurant_orders.update_many(
        {
            "room_number": customer.get('current_room'),
            "payment_status": "Pending"
        },
        {"$set": {
            "payment_status": "Paid",
            "payment_method": f"Room Bill - {checkout.payment_method}",
            "order_status": "Completed"
        }}
    )
    
    # Note: We don't create a separate income record for checkout because
    # the daily_sale record already captures this transaction.
    # This avoids double-counting in financial summaries.
    
    # Send checkout notifications (SMS + Email)
    try:
        notification_data = {
            "guest_name": customer.get("name"),
            "guest_email": customer.get("email"),
            "guest_phone": customer.get("phone"),
            "room_number": customer.get("current_room"),
            "total_amount": total_amount,
            "check_in_date": customer.get("check_in_date"),
            "check_out_date": customer.get("check_out_date")
        }
        await send_notifications(notification_data, "checkout")
    except Exception as e:
        print(f"Checkout notification error (non-critical): {str(e)}")
    asyncio.create_task(send_feedback_request(result))
    
    return {
        "message": "Customer checked out successfully",
        "billing_details": {
            "room_charges": base_room_charges,
            "restaurant_charges": restaurant_charges,
            "advance_amount": advance_amount,
            "additional_charges": additional_amount,
            "discount_amount": discount_amount,
            "subtotal": subtotal,
            "taxes": total_taxes,
            "tax_breakdown": all_taxes,
            "total_amount": total_amount,
            "payment_method": checkout.payment_method
        }
    }

@api_router.post("/extend-stay")
async def extend_customer_stay(
    extend_request: ExtendStayRequest,
    current_user: UserResponse = Depends(get_current_user)
):
    """Extend a checked-in customer's stay and update room charges accordingly"""
    # Find the customer
    customer = await db.customers.find_one({"id": extend_request.customer_id, "is_checked_out": False})
    if not customer:
        raise HTTPException(status_code=404, detail="Checked-in customer not found")
    
    current_checkout = customer.get('check_out_date')
    if isinstance(current_checkout, datetime):
        current_checkout = current_checkout.date()
    
    check_in_date = customer.get('check_in_date')
    if isinstance(check_in_date, datetime):
        check_in_date = check_in_date.date()
    
    new_checkout = extend_request.new_checkout_date
    
    # Validate new checkout date is after current checkout
    if new_checkout <= current_checkout:
        raise HTTPException(
            status_code=400, 
            detail=f"New checkout date must be after current checkout date ({current_checkout})"
        )
    
    room_number = customer.get('current_room')
    
    # Get room to calculate additional charges
    room = await db.rooms.find_one({"room_number": room_number})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    # Check for booking conflicts before extending stay
    # Find the current booking for this customer to exclude it from conflict check
    current_booking = await db.bookings.find_one({
        "guest_name": customer.get('name'),
        "room_number": room_number,
        "status": {"$in": ["Checked-in", "Checked In"]}
    })
    
    exclude_booking_id = current_booking.get('id') if current_booking else None
    
    # Check if extending conflicts with other bookings
    is_available, conflict_error = await check_room_availability_for_booking(
        room_number=room_number,
        check_in_date=check_in_date,  # Use original check-in
        check_out_date=new_checkout,   # Use new checkout
        exclude_booking_id=exclude_booking_id,
        skip_occupied_check=True  # Skip occupied check since we're extending the current occupant's stay
    )
    
    if not is_available:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot extend stay: {conflict_error}"
        )
    
    # Calculate customer's booked rate per night from their original booking
    # This ensures we use the rate they were charged, not the room's current default rate
    original_room_charges = customer.get('room_charges', 0.0)
    original_nights = (current_checkout - check_in_date).days
    if original_nights < 1:
        original_nights = 1
    
    # Use customer's booked rate, not room's default rate
    customer_rate_per_night = original_room_charges / original_nights if original_nights > 0 else 0.0
    
    # Calculate additional nights and charges using customer's rate
    additional_nights = (new_checkout - current_checkout).days
    additional_charges = customer_rate_per_night * additional_nights
    
    # Update customer record
    current_room_charges = customer.get('room_charges', 0.0)
    new_room_charges = current_room_charges + additional_charges
    
    await db.customers.update_one(
        {"id": extend_request.customer_id},
        {"$set": {
            "check_out_date": datetime.combine(new_checkout, datetime.min.time()),
            "room_charges": new_room_charges
        }}
    )
    
    # Update room checkout date
    await db.rooms.update_one(
        {"room_number": customer.get('current_room')},
        {"$set": {"check_out_date": datetime.combine(new_checkout, datetime.min.time())}}
    )
    
    # Update corresponding booking
    await db.bookings.update_one(
        {
            "guest_name": customer.get('name'),
            "room_number": customer.get('current_room'),
            "status": {"$in": ["Checked-in", "Checked In"]}
        },
        {"$set": {
            "check_out_date": datetime.combine(new_checkout, datetime.min.time()),
            "booking_amount": new_room_charges
        }}
    )
    
    # Log activity
    await log_activity(
        action="stay_extended",
        description=f"Extended stay for {customer.get('name')} from {current_checkout} to {new_checkout}",
        user_name=current_user.username,
        entity_type="customer",
        entity_id=extend_request.customer_id,
        details={
            "guest_name": customer.get('name'),
            "room_number": customer.get('current_room'),
            "old_checkout": str(current_checkout),
            "new_checkout": str(new_checkout),
            "additional_nights": additional_nights,
            "additional_charges": additional_charges
        }
    )
    
    return {
        "message": "Stay extended successfully",
        "details": {
            "guest_name": customer.get('name'),
            "room_number": customer.get('current_room'),
            "old_checkout_date": str(current_checkout),
            "new_checkout_date": str(new_checkout),
            "rate_per_night": customer_rate_per_night,
            "additional_nights": additional_nights,
            "additional_charges": additional_charges,
            "previous_room_charges": current_room_charges,
            "new_room_charges": new_room_charges
        }
    }

@api_router.post("/early-checkout")
async def early_checkout_customer(
    checkout_request: EarlyCheckoutRequest,
    current_user: UserResponse = Depends(get_current_user)
):
    """Handle early checkout with potential refund calculation"""
    # Find customer
    customer = await db.customers.find_one({"id": checkout_request.customer_id, "is_checked_out": False})
    if not customer:
        raise HTTPException(status_code=404, detail="Checked-in customer not found")
    
    planned_checkout = customer.get('check_out_date')
    if isinstance(planned_checkout, datetime):
        planned_checkout = planned_checkout.date()
    
    check_in_date = customer.get('check_in_date')
    if isinstance(check_in_date, datetime):
        check_in_date = check_in_date.date()
    
    actual_checkout = datetime.now().date()
    
    # Calculate planned nights to derive the customer's actual booked rate
    planned_nights = (planned_checkout - check_in_date).days
    if planned_nights < 1:
        planned_nights = 1
    
    original_room_charges = customer.get('room_charges', 0.0)
    
    # Use customer's actual booked rate per night (not room's default rate)
    # This ensures we use the rate the customer was charged, which may differ from room's current rate
    customer_rate_per_night = original_room_charges / planned_nights if planned_nights > 0 else 0.0
    
    # Calculate actual stay duration
    actual_nights = (actual_checkout - check_in_date).days
    if actual_nights < 1:
        actual_nights = 1  # Minimum 1 night charge
    
    # Calculate charges based on customer's booked rate, not room's default rate
    actual_room_charges = customer_rate_per_night * actual_nights
    
    # Calculate difference (positive = customer overpaid, negative = customer owes more)
    charge_difference = original_room_charges - actual_room_charges
    
    restaurant_charges = customer.get('restaurant_charges', 0.0)
    advance_amount = customer.get('advance_amount', 0.0)
    additional_amount = checkout_request.additional_amount
    discount_amount = checkout_request.discount_amount
    
    # Final room charges based on actual stay
    final_room_charges = actual_room_charges
    
    # Calculate total
    total_amount = final_room_charges + restaurant_charges + additional_amount - advance_amount - discount_amount
    
    # Handle refund logic
    refund_amount = 0.0
    if charge_difference > 0:  # Customer overpaid
        if checkout_request.refund_excess:
            refund_amount = charge_difference
            # If refunding, we use actual charges
        else:
            # Keep the excess - use original charges
            final_room_charges = original_room_charges
            total_amount = final_room_charges + restaurant_charges + additional_amount - advance_amount - discount_amount
    
    # Create daily sales record
    daily_sale = DailySale(
        date=datetime.now().date(),
        customer_name=customer.get('name', ''),
        room_number=customer.get('current_room', ''),
        room_charges=final_room_charges,
        additional_charges=restaurant_charges + additional_amount,
        discount_amount=discount_amount,
        advance_amount=advance_amount,
        total_amount=total_amount,
        payment_method=checkout_request.payment_method
    )
    
    daily_sale_dict = daily_sale.dict()
    daily_sale_dict['date'] = datetime.combine(daily_sale_dict['date'], datetime.min.time())
    await db.daily_sales.insert_one(daily_sale_dict)
    
    # Handle refund - record as expense (single source of truth for refunds)
    if checkout_request.refund_amount > 0:
        refund_amount = checkout_request.refund_amount
        expense_id = str(uuid.uuid4())
        await db.expenses.insert_one({
            "id": expense_id,
            "expense_date": datetime.combine(datetime.now().date(), datetime.min.time()),
            "category": "Refund",
            "description": f"Early checkout refund for {customer.get('name')} - Room {customer.get('current_room')}",
            "amount": refund_amount,
            "payment_method": checkout_request.payment_method,
            "created_by": current_user.username,
            "created_at": datetime.now()
        })
    
    # Handle collection - this is already captured in the daily_sale record
    # We don't create a separate income record to avoid double-counting
    # The collection_amount is just informational for the API response
    collection_recorded = checkout_request.collection_amount if checkout_request.collection_amount > 0 else 0
    
    # Update customer record
    await db.customers.update_one(
        {"id": checkout_request.customer_id},
        {"$set": {
            "room_charges": final_room_charges,
            "additional_charges": additional_amount,
            "discount_amount": discount_amount,
            "total_amount": total_amount,
            "is_checked_out": True,
            "actual_checkout_date": datetime.now()
        }}
    )
    
    # Update booking status
    await db.bookings.update_one(
        {
            "guest_name": customer.get('name'),
            "room_number": customer.get('current_room'),
            "status": {"$in": ["Checked-in", "Checked In"]}
        },
        {"$set": {"status": "Completed"}}
    )
    
    # Update room status to Pending Cleaning
    await db.rooms.update_one(
        {"room_number": customer.get('current_room')},
        {"$set": {"status": "Pending Cleaning", "current_guest": None, "check_in_date": None, "check_out_date": None, "last_guest": customer.get('name', 'Unknown')}}
    )
    
    # Mark restaurant orders as paid
    await db.restaurant_orders.update_many(
        {
            "room_number": customer.get('current_room'),
            "payment_status": "Pending"
        },
        {"$set": {
            "payment_status": "Paid",
            "payment_method": f"Room Bill - {checkout_request.payment_method}",
            "order_status": "Completed"
        }}
    )
    
    # Log activity
    await log_activity(
        action="early_checkout",
        description=f"Early checkout for {customer.get('name')} from room {customer.get('current_room')}",
        user_name=current_user.username,
        entity_type="checkout",
        entity_id=checkout_request.customer_id,
        details={
            "guest_name": customer.get('name'),
            "room_number": customer.get('current_room'),
            "planned_checkout": str(planned_checkout),
            "actual_checkout": str(actual_checkout),
            "days_early": (planned_checkout - actual_checkout).days,
            "original_charges": original_room_charges,
            "actual_charges": actual_room_charges,
            "refund_amount": refund_amount,
            "refund_given": checkout_request.refund_excess
        }
    )
    updated_customer = await db.customers.find_one({"id": checkout_request.customer_id})
    asyncio.create_task(send_feedback_request(updated_customer))
    
    return {
        "message": "Early checkout completed successfully",
        "billing_details": {
            "check_in_date": str(check_in_date),
            "planned_checkout_date": str(planned_checkout),
            "actual_checkout_date": str(actual_checkout),
            "days_early": (planned_checkout - actual_checkout).days,
            "planned_nights": planned_nights,
            "actual_nights": actual_nights,
            "rate_per_night": customer_rate_per_night,
            "original_room_charges": original_room_charges,
            "actual_room_charges": actual_room_charges,
            "charge_difference": charge_difference,
            "refund_given": checkout_request.refund_excess,
            "refund_amount": refund_amount if checkout_request.refund_excess else 0,
            "final_room_charges": final_room_charges,
            "restaurant_charges": restaurant_charges,
            "additional_charges": additional_amount,
            "discount_amount": discount_amount,
            "advance_amount": advance_amount,
            "total_amount": total_amount,
            "payment_method": checkout_request.payment_method
        }
    }

@api_router.get("/customer/{customer_id}/checkout-preview")
async def preview_checkout(
    customer_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Preview checkout details including early checkout calculations"""
    customer = await db.customers.find_one({"id": customer_id, "is_checked_out": False})
    if not customer:
        raise HTTPException(status_code=404, detail="Checked-in customer not found")
    
    planned_checkout = customer.get('check_out_date')
    if isinstance(planned_checkout, datetime):
        planned_checkout = planned_checkout.date()
    
    check_in_date = customer.get('check_in_date')
    if isinstance(check_in_date, datetime):
        check_in_date = check_in_date.date()
    
    actual_checkout = datetime.now().date()
    
    # Calculate planned stays first
    planned_nights = (planned_checkout - check_in_date).days
    if planned_nights < 1:
        planned_nights = 1
    
    # Calculate the customer's actual rate per night from their booking
    original_room_charges = customer.get('room_charges', 0.0)
    customer_rate_per_night = original_room_charges / planned_nights if planned_nights > 0 else 0
    
    # Calculate actual stays
    actual_nights = (actual_checkout - check_in_date).days
    if actual_nights < 1:
        actual_nights = 1
    
    # Calculate charges based on customer's rate, not room's default rate
    actual_room_charges = customer_rate_per_night * actual_nights
    
    is_early_checkout = actual_checkout < planned_checkout
    charge_difference = original_room_charges - actual_room_charges if is_early_checkout else 0
    
    return {
        "customer_name": customer.get('name'),
        "room_number": customer.get('current_room'),
        "check_in_date": str(check_in_date),
        "planned_checkout_date": str(planned_checkout),
        "actual_checkout_date": str(actual_checkout),
        "is_early_checkout": is_early_checkout,
        "planned_nights": planned_nights,
        "actual_nights": actual_nights,
        "days_early": (planned_checkout - actual_checkout).days if is_early_checkout else 0,
        "price_per_night": customer_rate_per_night,
        "original_room_charges": original_room_charges,
        "actual_room_charges": actual_room_charges,
        "potential_refund": charge_difference if charge_difference > 0 else 0,
        "restaurant_charges": customer.get('restaurant_charges', 0.0),
        "advance_amount": customer.get('advance_amount', 0.0)
    }

@api_router.post("/advance-payment")
async def collect_advance_payment(
    advance_request: AdvancePaymentRequest, 
    current_user: UserResponse = Depends(get_current_user)
):
    """Collect advance payment from checked-in customer and record as income"""
    # Find the customer
    customer = await db.customers.find_one({"id": advance_request.customer_id})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Update customer's advance amount (increase it)
    current_advance = customer.get("advance_amount", 0.0)
    new_advance = current_advance + advance_request.amount
    
    await db.customers.update_one(
        {"id": advance_request.customer_id},
        {"$set": {"advance_amount": new_advance}}
    )
    
    # Record as income
    income = Income(
        description=f"Advance payment from {customer['name']} - Room {customer['current_room']}",
        amount=advance_request.amount,
        category="Advance Payment",
        payment_method=advance_request.payment_method,
        income_date=datetime.now().date(),
        guest_name=customer["name"],
        created_by=current_user.username
    )
    
    # Convert date to datetime for MongoDB storage
    income_dict = income.dict()
    income_dict['income_date'] = datetime.combine(income_dict['income_date'], datetime.min.time())
    await db.incomes.insert_one(income_dict)
    
    # Note: We don't update settings.cash_balance/bank_balance directly because
    # balances are computed dynamically from incomes, daily_sales, and expenses

    # Log activity
    await log_activity(
        action="advance_payment_collected",
        description=f"Advance payment of {advance_request.amount} collected from {customer['name']} in room {customer['current_room']}",
        user_name=current_user.username,
        entity_type="payment",
        entity_id=advance_request.customer_id,
        details={
            "guest_name": customer["name"],
            "room_number": customer["current_room"],
            "amount": advance_request.amount,
            "payment_method": advance_request.payment_method,
            "new_total_advance": new_advance
        }
    )
    
    return {
        "message": f"Advance payment of {advance_request.amount} collected successfully",
        "customer_name": customer["name"],
        "amount_collected": advance_request.amount,
        "new_total_advance": new_advance
    }

@api_router.post("/checkin")
async def checkin_customer(checkin: CheckinRequest):
    # Find the booking
    booking = await db.bookings.find_one({"id": checkin.booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    # Determine the room to use (original or changed)
    target_room_number = checkin.new_room_number if checkin.new_room_number else booking["room_number"]
    
    # Check if target room is available
    room = await db.rooms.find_one({"room_number": target_room_number})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    # Allow check-in if room is Available or if it has a booking (not currently occupied)
    if room["status"] == "Occupied":
        if room.get("current_guest") and room.get("current_guest") != booking["guest_name"]:
            raise HTTPException(status_code=400, detail="Room is currently occupied by another guest")
    
    # If room changed, update the booking record
    if checkin.new_room_number and checkin.new_room_number != booking["room_number"]:
        await db.bookings.update_one(
            {"id": checkin.booking_id},
            {"$set": {"room_number": checkin.new_room_number}}
        )
        booking["room_number"] = checkin.new_room_number
    
    
    # Use the booking amount as room charges (actual amount customer agreed to pay)
    room_charges = booking.get("booking_amount", 500.0)
    
    # Ensure advance_amount is a valid number (handle None, empty string, etc.)
    advance_amount = checkin.advance_amount if checkin.advance_amount is not None else 0.0
    
    # Create customer record
    customer = Customer(
        name=booking["guest_name"],
        email=booking["guest_email"],
        phone=booking["guest_phone"],
        current_room=booking["room_number"],
        check_in_date=booking["check_in_date"] if isinstance(booking["check_in_date"], date) else booking["check_in_date"].date(),
        check_out_date=booking["check_out_date"] if isinstance(booking["check_out_date"], date) else booking["check_out_date"].date(),
        advance_amount=advance_amount,
        notes=checkin.notes,
        room_charges=room_charges,
        total_amount=room_charges - advance_amount,
        is_checked_out=False,  # Currently checked in
        actual_checkout_date=None  # No actual checkout yet
    )
    
    # Add customer to checked-in list
    customer_dict = customer.dict()
    customer_dict['check_in_date'] = datetime.combine(customer_dict['check_in_date'], datetime.min.time())
    customer_dict['check_out_date'] = datetime.combine(customer_dict['check_out_date'], datetime.min.time())
    # actual_checkout_date is None, so no conversion needed
    await db.customers.insert_one(customer_dict)
    
    # Record advance amount as Room Booking Income if amount > 0
    if advance_amount > 0:
        advance_sale = {
            "id": str(uuid.uuid4()),
            "date": datetime.combine(datetime.now().date(), datetime.min.time()),
            "customer_name": booking['guest_name'],
            "room_number": booking['room_number'],
            "total_amount": advance_amount,
            "payment_method": checkin.payment_method,
            "booking_id": checkin.booking_id,
            "sale_type": "room_booking_advance",
            "created_at": datetime.now()
        }
        await db.daily_sales.insert_one(advance_sale)
    
    # Update room status to occupied
    await db.rooms.update_one(
        {"room_number": target_room_number},
        {"$set": {
            "status": "Occupied",
            "current_guest": booking["guest_name"],
            "check_in_date": datetime.combine(booking["check_in_date"] if isinstance(booking["check_in_date"], date) else booking["check_in_date"].date(), datetime.min.time()),
            "check_out_date": datetime.combine(booking["check_out_date"] if isinstance(booking["check_out_date"], date) else booking["check_out_date"].date(), datetime.min.time())
        }}
    )
    
    # Update booking status to checked-in
    await db.bookings.update_one(
        {"id": checkin.booking_id},
        {"$set": {"status": "Checked In"}}
    )
    
    # Log activity
    await log_activity(
        action="customer_checked_in",
        description=f"Customer {booking['guest_name']} checked in to room {booking['room_number']}",
        entity_type="checkin",
        entity_id=customer.id,
        details={
            "guest_name": booking["guest_name"],
            "room_number": booking["room_number"],
            "advance_amount": checkin.advance_amount,
            "payment_method": checkin.payment_method
        }
    )
    
    # Send check-in notifications (SMS + Email)
    try:
        notification_data = {
            "guest_name": booking["guest_name"],
            "guest_email": booking["guest_email"],
            "guest_phone": booking["guest_phone"],
            "room_number": booking["room_number"],
            "check_in_date": booking["check_in_date"],
            "check_out_date": booking["check_out_date"]
        }
        await send_notifications(notification_data, "checkin")
    except Exception as e:
        print(f"Check-in notification error (non-critical): {str(e)}")
    
    return {"message": "Customer checked in successfully", "customer": customer}

@api_router.post("/cancel/{booking_id}")
async def cancel_booking(
    booking_id: str, 
    current_user: UserResponse = Depends(get_current_active_admin)
):
    """Cancel a booking (Admin only) - handles both upcoming and checked-in bookings"""
    # Find the booking
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    booking_status = booking.get("status", "")
    guest_name = booking.get("guest_name", "")
    room_number = booking.get("room_number", "")
    
    # Update booking status to cancelled
    result = await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": "Cancelled"}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    # Handle different booking statuses
    if booking_status == "Upcoming":
        # If room was reserved for this booking, make it available
        await db.rooms.update_one(
            {"room_number": room_number, "status": "Reserved"},
            {"$set": {"status": "Available", "current_guest": None, "check_in_date": None, "check_out_date": None}}
        )
    elif booking_status in ["Checked-in", "Checked In"]:
        # If guest is currently checked in, remove from customers and set room to Pending Cleaning
        await db.customers.delete_one({
            "name": guest_name,
            "current_room": room_number
        })
        
        # Set room to Pending Cleaning (was occupied, needs cleaning)
        await db.rooms.update_one(
            {"room_number": room_number},
            {"$set": {"status": "Pending Cleaning", "current_guest": None, "check_in_date": None, "check_out_date": None, "last_guest": guest_name}}
        )
    
    # Log activity
    await log_activity(
        action="booking_cancelled",
        description=f"Booking for {guest_name} in room {room_number} cancelled by admin (was {booking_status})",
        user_name=current_user.username,
        entity_type="booking",
        entity_id=booking_id,
        details={
            "guest_name": guest_name,
            "room_number": room_number,
            "original_status": booking_status
        }
    )
    
    return {
        "message": f"Booking cancelled successfully. Guest {guest_name} removed from room {room_number}.",
        "original_status": booking_status
    }

# Initialize sample data
@api_router.post("/init-data")
async def initialize_sample_data():
    # Check if data already exists
    existing_rooms = await db.rooms.count_documents({})
    if existing_rooms > 0:
        return {"message": "Sample data already exists"}
    
    # Create sample rooms
    sample_rooms = [
        Room(room_number="101", room_type="Suite", status="Available", price_per_night=1500.0, max_occupancy=4, amenities=["WiFi", "TV", "AC", "Mini Fridge", "Room Service", "Balcony"]),
        Room(room_number="102", room_type="Double", status="Occupied", current_guest="John Doe", check_in_date=date.today(), check_out_date=date(2025, 7, 15), price_per_night=8500.0, max_occupancy=2, amenities=["WiFi", "TV", "AC", "Mini Fridge", "Room Service"]),
        Room(room_number="103", room_type="Double", status="Available", price_per_night=6500.0, max_occupancy=2, amenities=["WiFi", "TV", "AC", "Mini Fridge", "Room Service"]),
        Room(room_number="201", room_type="Double", status="Available", price_per_night=9000.0, max_occupancy=2, amenities=["WiFi", "TV", "AC", "Mini Fridge", "Room Service"]),
        Room(room_number="202", room_type="Triple", status="Available", price_per_night=12000.0, max_occupancy=3, amenities=["WiFi", "TV", "AC", "Mini Fridge", "Room Service"]),
        Room(room_number="203", room_type="Double", status="Available", price_per_night=7500.0, max_occupancy=2, amenities=["WiFi", "TV", "AC", "Mini Fridge"]),
        Room(room_number="204", room_type="Triple", status="Available", price_per_night=11000.0, max_occupancy=3, amenities=["WiFi", "TV", "AC", "Mini Fridge", "Room Service"]),
        Room(room_number="205", room_type="Double", status="Reserved", price_per_night=8000.0, max_occupancy=2, amenities=["WiFi", "TV", "AC", "Mini Fridge", "Room Service"]),
        Room(room_number="301", room_type="Double", status="Available", price_per_night=7000.0, max_occupancy=2, amenities=["WiFi", "TV", "AC", "Mini Fridge"]),
        Room(room_number="302", room_type="Double", status="Available", price_per_night=7200.0, max_occupancy=2, amenities=["WiFi", "TV", "AC", "Mini Fridge"]),
    ]
    
    for room in sample_rooms:
        room_dict = room.dict()
        # Convert date objects to datetime for MongoDB compatibility
        if room_dict.get('check_in_date'):
            room_dict['check_in_date'] = datetime.combine(room_dict['check_in_date'], datetime.min.time())
        if room_dict.get('check_out_date'):
            room_dict['check_out_date'] = datetime.combine(room_dict['check_out_date'], datetime.min.time())
        await db.rooms.insert_one(room_dict)
    
    # Create sample bookings
    sample_bookings = [
        Booking(guest_name="Alice Johnson", guest_email="alice@example.com", guest_phone="123-456-7890", 
                guest_id_passport="P123456789", guest_country="USA",
                room_number="103", check_in_date=date(2025, 7, 16), check_out_date=date(2025, 7, 20), 
                stay_type="Night Stay", booking_amount=2000.0, status="Upcoming", additional_notes="Early check-in requested"),
        Booking(guest_name="Bob Smith", guest_email="bob@example.com", guest_phone="098-765-4321", 
                guest_id_passport="P987654321", guest_country="Canada",
                room_number="201", check_in_date=date(2025, 7, 18), check_out_date=date(2025, 7, 22), 
                stay_type="Night Stay", booking_amount=1800.0, status="Upcoming", additional_notes="Business traveler"),
        Booking(guest_name="Carol Davis", guest_email="carol@example.com", guest_phone="555-123-4567", 
                guest_id_passport="P555444333", guest_country="UK",
                room_number="301", check_in_date=date(2025, 7, 20), check_out_date=date(2025, 7, 25), 
                stay_type="Night Stay", booking_amount=2500.0, status="Upcoming", additional_notes="Celebrating anniversary"),
    ]
    
    for booking in sample_bookings:
        booking_dict = booking.dict()
        # Convert date objects to datetime for MongoDB compatibility
        booking_dict['check_in_date'] = datetime.combine(booking_dict['check_in_date'], datetime.min.time())
        booking_dict['check_out_date'] = datetime.combine(booking_dict['check_out_date'], datetime.min.time())
        await db.bookings.insert_one(booking_dict)
    
    # Create sample checked-in customers
    sample_customers = [
        Customer(name="John Doe", email="john@example.com", phone="111-222-3333", 
                current_room="102", check_in_date=date.today(), check_out_date=date(2025, 7, 15),
                advance_amount=200.0, notes="VIP guest", room_charges=500.0, total_amount=300.0),
        Customer(name="Jane Wilson", email="jane@example.com", phone="444-555-6666", 
                current_room="205", check_in_date=date(2025, 7, 10), check_out_date=date(2025, 7, 14),
                advance_amount=150.0, notes="Early check-in requested", room_charges=750.0, total_amount=600.0),
    ]
    
    for customer in sample_customers:
        customer_dict = customer.dict()
        # Convert date objects to datetime for MongoDB compatibility
        customer_dict['check_in_date'] = datetime.combine(customer_dict['check_in_date'], datetime.min.time())
        customer_dict['check_out_date'] = datetime.combine(customer_dict['check_out_date'], datetime.min.time())
        await db.customers.insert_one(customer_dict)
    
    # Create sample expenses
    sample_expenses = [
        Expense(description="Monthly electricity bill", amount=1500.0, category="Utilities", expense_date=date(2025, 7, 5)),
        Expense(description="Housekeeping supplies", amount=800.0, category="Maintenance", expense_date=date(2025, 7, 8)),
        Expense(description="Staff salaries", amount=25000.0, category="Staff", expense_date=date(2025, 7, 1)),
        Expense(description="Food and beverages", amount=3500.0, category="Food", expense_date=date(2025, 7, 10)),
        Expense(description="Marketing campaign", amount=2000.0, category="Marketing", expense_date=date(2025, 7, 6)),
        Expense(description="Internet and phone bills", amount=500.0, category="Utilities", expense_date=date(2025, 7, 7)),
        Expense(description="Room maintenance", amount=1200.0, category="Maintenance", expense_date=date(2025, 7, 9)),
    ]
    
    for expense in sample_expenses:
        expense_dict = expense.dict()
        # Convert date to datetime for MongoDB compatibility
        expense_dict['expense_date'] = datetime.combine(expense_dict['expense_date'], datetime.min.time())
        await db.expenses.insert_one(expense_dict)
    
    # Create default admin user if no users exist
    existing_users = await db.users.count_documents({})
    if existing_users == 0:
        default_admin = User(
            username="admin",
            password_hash=get_password_hash("admin123"),
            full_name="System Administrator",
            role="Admin",
            email="admin@hotel.com"
        )
        await db.users.insert_one(default_admin.dict())
        
        # Create sample staff user
        sample_staff = User(
            username="staff1",
            password_hash=get_password_hash("staff123"),
            full_name="Hotel Staff",
            role="Staff",
            email="staff@hotel.com"
        )
        await db.users.insert_one(sample_staff.dict())
    
    # Create default settings if none exist
    existing_settings = await db.settings.count_documents({})
    if existing_settings == 0:
        default_settings = Settings(
            hotel_name="Grand Hotel Paradise",
            hotel_contact="+94 11 234 5678",
            hotel_address="123 Ocean View Road, Colombo 03, Sri Lanka",
            hotel_email="info@grandhotelparadise.com",
            hotel_phone="+94 11 234 5678",
            currency="LKR",
            check_in_time="14:00",
            check_out_time="12:00",
            default_room_rate=8000.0,
            tax_rate=10.0
        )
        await db.settings.insert_one(default_settings.dict())
    
    # Create default booking channels if none exist
    existing_channels = await db.booking_channels.count_documents({})
    if existing_channels == 0:
        default_channels = [
            BookingChannel(
                channel_name="Direct",
                channel_type="Direct",
                commission_rate=0.0,
                contact_email="",
                contact_phone="",
                is_active=True
            ),
            BookingChannel(
                channel_name="Booking.com",
                channel_type="OTA",
                commission_rate=15.0,
                contact_email="partners@booking.com",
                contact_phone="",
                is_active=True
            ),
            BookingChannel(
                channel_name="Expedia",
                channel_type="OTA", 
                commission_rate=18.0,
                contact_email="partners@expedia.com",
                contact_phone="",
                is_active=True
            ),
            BookingChannel(
                channel_name="Agoda",
                channel_type="OTA",
                commission_rate=16.5,
                contact_email="partners@agoda.com",
                contact_phone="",
                is_active=True
            ),
            BookingChannel(
                channel_name="Walk-in",
                channel_type="Direct",
                commission_rate=0.0,
                contact_email="",
                contact_phone="",
                is_active=True
            ),
            BookingChannel(
                channel_name="Corporate",
                channel_type="Corporate",
                commission_rate=5.0,
                contact_email="corporate@hotel.com",
                contact_phone="",
                is_active=True
            )
        ]
        
        for channel in default_channels:
            await db.booking_channels.insert_one(channel.dict())
    
    # Create restaurant manager user if not exists
    restaurant_manager = await db.users.find_one({"username": "restaurant"})
    if not restaurant_manager:
        restaurant_user = User(
            username="restaurant",
            password_hash=get_password_hash("restaurant123"),
            full_name="Restaurant Manager",
            role="Restaurant Manager",
            email="restaurant@hotel.com"
        )
        await db.users.insert_one(restaurant_user.dict())
    
    # Initialize default menu categories
    existing_categories = await db.menu_categories.count_documents({})
    if existing_categories == 0:
        default_categories = [
            MenuCategory(name="Appetizers", description="Start your meal right", display_order=1),
            MenuCategory(name="Main Course", description="Hearty main dishes", display_order=2),
            MenuCategory(name="Beverages", description="Refreshing drinks", display_order=3),
            MenuCategory(name="Desserts", description="Sweet endings", display_order=4),
        ]
        
        for category in default_categories:
            await db.menu_categories.insert_one(category.dict())
    
    # Initialize sample menu items
    existing_items = await db.menu_items.count_documents({})
    if existing_items == 0:
        # Get category IDs for menu items
        categories = await db.menu_categories.find({"is_active": True}).to_list(10)
        category_map = {cat["name"]: cat["id"] for cat in categories}
        
        if category_map:
            sample_items = [
                MenuItem(name="Spring Rolls", description="Crispy vegetable spring rolls with sweet chili sauce", 
                        price=850.0, category_id=category_map.get("Appetizers", ""), is_vegetarian=True),
                MenuItem(name="Chicken Wings", description="Buffalo chicken wings with blue cheese dip", 
                        price=1200.0, category_id=category_map.get("Appetizers", "")),
                MenuItem(name="Grilled Chicken", description="Herb marinated grilled chicken with vegetables", 
                        price=2200.0, category_id=category_map.get("Main Course", "")),
                MenuItem(name="Fish Curry", description="Traditional Sri Lankan fish curry with rice", 
                        price=1800.0, category_id=category_map.get("Main Course", ""), is_spicy=True),
                MenuItem(name="Vegetable Fried Rice", description="Wok-fried rice with fresh vegetables", 
                        price=1400.0, category_id=category_map.get("Main Course", ""), is_vegetarian=True),
                MenuItem(name="Fresh Lime Juice", description="Freshly squeezed lime juice", 
                        price=450.0, category_id=category_map.get("Beverages", "")),
                MenuItem(name="Coffee", description="Freshly brewed Ceylon coffee", 
                        price=350.0, category_id=category_map.get("Beverages", "")),
                MenuItem(name="Chocolate Cake", description="Rich chocolate cake with vanilla ice cream", 
                        price=800.0, category_id=category_map.get("Desserts", "")),
            ]
            
            for item in sample_items:
                await db.menu_items.insert_one(item.dict())
    
    # Initialize sample restaurant staff
    existing_staff = await db.restaurant_staff.count_documents({})
    if existing_staff == 0:
        sample_staff = [
            RestaurantStaff(name="John Silva", role="Waiter", phone="+94771234567"),
            RestaurantStaff(name="Mary Fernando", role="Waiter", phone="+94771234568"),
            RestaurantStaff(name="Chef Kumar", role="Chef", phone="+94771234569"),
        ]
        
        for staff in sample_staff:
            await db.restaurant_staff.insert_one(staff.dict())
    
    return {"message": "Sample data initialized successfully"}

# Guest Management Routes
@api_router.get("/guests")
async def get_guests():
    # Get all bookings to extract guest information - exclude large proof field
    bookings = await db.bookings.find({}, {"_id": 0, "guest_id_proof": 0}).to_list(1000)
    
    # Create a dictionary to store unique guests with their booking history
    guests_dict = {}
    
    for booking in bookings:
        guest_name = booking.get('guest_name')
        guest_email = booking.get('guest_email', '')
        guest_phone = booking.get('guest_phone', '')
        
        # Skip bookings without at least a guest name
        if not guest_name:
            continue
            
        # Create a unique identifier - use email if available, otherwise use name + phone
        if guest_email:
            guest_key = guest_email
        else:
            guest_key = f"{guest_name}_{guest_phone}_{booking.get('id', '')}"
        
        if guest_key not in guests_dict:
            # Convert datetime back to date for response
            check_in_date = booking.get('check_in_date')
            check_out_date = booking.get('check_out_date')
            if isinstance(check_in_date, datetime):
                check_in_date = check_in_date.date()
            if isinstance(check_out_date, datetime):
                check_out_date = check_out_date.date()
            
            guests_dict[guest_key] = {
                'id': guest_key,  # Using unique key as identifier
                'name': guest_name,
                'email': guest_email or 'Not provided',
                'phone': guest_phone or 'Not provided',
                'total_bookings': 0,
                'total_stays': 0,
                'last_stay': None,
                'upcoming_bookings': 0,
                'bookings': []
            }
        
        # Add booking to guest's history
        check_in_date = booking.get('check_in_date')
        check_out_date = booking.get('check_out_date')
        if isinstance(check_in_date, datetime):
            check_in_date = check_in_date.date()
        if isinstance(check_out_date, datetime):
            check_out_date = check_out_date.date()
        
        booking_info = {
            'id': booking.get('id'),
            'room_number': booking.get('room_number'),
            'check_in_date': check_in_date,
            'check_out_date': check_out_date,
            'status': booking.get('status'),
            'created_at': booking.get('created_at')
        }
        
        guests_dict[guest_key]['bookings'].append(booking_info)
        guests_dict[guest_key]['total_bookings'] += 1
        
        # Update stats based on booking status
        if booking.get('status') == 'Completed':
            guests_dict[guest_key]['total_stays'] += 1
            if not guests_dict[guest_key]['last_stay'] or check_out_date > guests_dict[guest_key]['last_stay']:
                guests_dict[guest_key]['last_stay'] = check_out_date
        elif booking.get('status') == 'Upcoming':
            guests_dict[guest_key]['upcoming_bookings'] += 1
    
    # Convert dictionary to list and sort by name
    guests_list = list(guests_dict.values())
    guests_list.sort(key=lambda x: x['name'])
    
    return guests_list

@api_router.get("/guests/{guest_id:path}")
async def get_guest_details(guest_id: str):
    # Try to find by email first (if guest_id contains @)
    if '@' in guest_id:
        bookings = await db.bookings.find({"guest_email": guest_id}, {"_id": 0}).to_list(1000)
    else:
        # guest_id is a composite key: name_phone_bookingId
        # Try to find the booking by the booking ID part
        parts = guest_id.rsplit('_', 1)
        if len(parts) == 2:
            booking_id = parts[1]
            first_booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
            if first_booking:
                # Find all bookings by this guest (name + phone match)
                bookings = await db.bookings.find({
                    "guest_name": first_booking.get("guest_name"),
                    "guest_phone": first_booking.get("guest_phone")
                }, {"_id": 0}).to_list(1000)
            else:
                bookings = []
        else:
            bookings = []
    
    if not bookings:
        raise HTTPException(status_code=404, detail="Guest not found")
    
    # Convert datetime back to date for response
    for booking in bookings:
        if isinstance(booking.get('check_in_date'), datetime):
            booking['check_in_date'] = booking['check_in_date'].date()
        if isinstance(booking.get('check_out_date'), datetime):
            booking['check_out_date'] = booking['check_out_date'].date()
    
    # Collect ID proof from any booking that has it
    id_proof = ""
    id_proof_filename = ""
    for b in bookings:
        if b.get('guest_id_proof'):
            id_proof = b['guest_id_proof']
            id_proof_filename = b.get('guest_id_proof_filename', 'document.pdf')
            break
    
    guest_info = {
        'name': bookings[0].get('guest_name'),
        'email': bookings[0].get('guest_email', ''),
        'phone': bookings[0].get('guest_phone', ''),
        'country': bookings[0].get('guest_country', ''),
        'id_passport': bookings[0].get('guest_id_passport', ''),
        'id_proof': id_proof,
        'id_proof_filename': id_proof_filename,
        'bookings': [{
            'id': b.get('id'),
            'room_number': b.get('room_number'),
            'check_in_date': b.get('check_in_date'),
            'check_out_date': b.get('check_out_date'),
            'status': b.get('status'),
            'created_at': b.get('created_at'),
            'booking_amount': b.get('booking_amount', 0)
        } for b in bookings]
    }
    
    return guest_info

class GuestUpdateRequest(BaseModel):
    guest_id: str  # Unique guest identifier (email or name_phone_bookingId)
    original_email: Optional[str] = None  # Kept for backward compatibility
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    id_passport: Optional[str] = None
    country: Optional[str] = None

@api_router.put("/guests/update")
async def update_guest_details(
    guest_update: GuestUpdateRequest,
    current_user: UserResponse = Depends(get_current_user)
):
    """Update guest details across all their bookings and customer records"""
    update_fields = {}
    
    if guest_update.name:
        update_fields['guest_name'] = guest_update.name
    if guest_update.email:
        update_fields['guest_email'] = guest_update.email
    if guest_update.phone:
        update_fields['guest_phone'] = guest_update.phone
    if guest_update.id_passport:
        update_fields['guest_id_passport'] = guest_update.id_passport
    if guest_update.country:
        update_fields['guest_country'] = guest_update.country
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    # Determine how to find the bookings to update
    guest_id = guest_update.guest_id
    
    # Check if guest_id is an email (contains @) or a composite key (name_phone_bookingId)
    if '@' in guest_id:
        # Guest has email - find by email
        query = {"guest_email": guest_id}
    else:
        # Guest doesn't have email - guest_id is composite key (name_phone_bookingId)
        # Extract the booking_id from the composite key
        parts = guest_id.rsplit('_', 1)  # Split from the right to get booking_id
        if len(parts) == 2:
            booking_id = parts[1]
            # Find the specific booking and then update by guest_name
            booking = await db.bookings.find_one({"id": booking_id})
            if booking:
                query = {"guest_name": booking.get('guest_name'), "guest_email": {"$in": ["", None]}}
            else:
                raise HTTPException(status_code=404, detail="Booking not found")
        else:
            raise HTTPException(status_code=400, detail="Invalid guest identifier")
    
    # Update all bookings for this guest
    booking_result = await db.bookings.update_many(
        query,
        {"$set": update_fields}
    )
    
    # Update customer records if name changed
    customer_update_fields = {}
    if guest_update.name:
        customer_update_fields['name'] = guest_update.name
    if guest_update.email:
        customer_update_fields['email'] = guest_update.email
    if guest_update.phone:
        customer_update_fields['phone'] = guest_update.phone
    
    if customer_update_fields:
        # Update customer records - find by the same query used for bookings
        if '@' in guest_id:
            customer_query = {"email": guest_id}
        else:
            # For guests without email, match by name
            parts = guest_id.rsplit('_', 1)
            if len(parts) == 2:
                booking_id = parts[1]
                booking = await db.bookings.find_one({"id": booking_id})
                if booking:
                    customer_query = {"name": booking.get('guest_name')}
                else:
                    customer_query = None
            else:
                customer_query = None
        
        if customer_query:
            await db.customers.update_many(
                customer_query,
                {"$set": customer_update_fields}
            )
    
    return {
        "message": "Guest details updated successfully",
        "bookings_updated": booking_result.modified_count
    }

# Guest ID Proof management
class GuestProofUpload(BaseModel):
    guest_id: str
    id_proof: str  # Base64 encoded PDF
    id_proof_filename: str

@api_router.post("/guests/upload-proof")
async def upload_guest_proof(
    data: GuestProofUpload,
    current_user: UserResponse = Depends(get_current_user)
):
    """Upload or replace ID proof for a guest"""
    guest_id = data.guest_id
    
    if '@' in guest_id:
        query = {"guest_email": guest_id}
    else:
        parts = guest_id.rsplit('_', 1)
        if len(parts) == 2:
            booking_id = parts[1]
            booking = await db.bookings.find_one({"id": booking_id})
            if booking:
                query = {"guest_name": booking.get('guest_name'), "guest_phone": booking.get('guest_phone', '')}
            else:
                raise HTTPException(status_code=404, detail="Guest not found")
        else:
            raise HTTPException(status_code=400, detail="Invalid guest identifier")
    
    result = await db.bookings.update_many(
        query,
        {"$set": {"guest_id_proof": data.id_proof, "guest_id_proof_filename": data.id_proof_filename}}
    )
    
    return {"message": "ID proof uploaded successfully", "bookings_updated": result.modified_count}

@api_router.delete("/guests/delete-proof/{guest_id:path}")
async def delete_guest_proof(
    guest_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Delete ID proof for a guest"""
    if '@' in guest_id:
        query = {"guest_email": guest_id}
    else:
        parts = guest_id.rsplit('_', 1)
        if len(parts) == 2:
            booking_id = parts[1]
            booking = await db.bookings.find_one({"id": booking_id})
            if booking:
                query = {"guest_name": booking.get('guest_name'), "guest_phone": booking.get('guest_phone', '')}
            else:
                raise HTTPException(status_code=404, detail="Guest not found")
        else:
            raise HTTPException(status_code=400, detail="Invalid guest identifier")
    
    result = await db.bookings.update_many(
        query,
        {"$set": {"guest_id_proof": "", "guest_id_proof_filename": ""}}
    )
    
    return {"message": "ID proof deleted successfully", "bookings_updated": result.modified_count}

# Menu item edit and delete-check endpoints
@api_router.put("/restaurant/menu-items/{item_id}")
async def update_menu_item(
    item_id: str,
    item_update: MenuItemUpdate,
    current_user: UserResponse = Depends(get_current_user)
):
    """Update a menu item and sync changes to linked stock items"""
    existing = await db.menu_items.find_one({"id": item_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Menu item not found")
    
    update_fields = {k: v for k, v in item_update.dict().items() if v is not None}
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    await db.menu_items.update_one({"id": item_id}, {"$set": update_fields})
    
    # Sync name and category to linked stock item if exists
    if existing.get('stock_item_id') and (item_update.name or item_update.category_id):
        stock_update = {}
        if item_update.name:
            stock_update['item_name'] = item_update.name
        if item_update.category_id:
            # Get category name
            cat = await db.menu_categories.find_one({"id": item_update.category_id})
            if cat:
                stock_update['category'] = cat['name']
        if stock_update:
            await db.stock_items.update_one(
                {"id": existing['stock_item_id']},
                {"$set": stock_update}
            )
    
    updated = await db.menu_items.find_one({"id": item_id}, {"_id": 0})
    return updated

@api_router.get("/restaurant/menu-items/{item_id}/can-delete")
async def check_menu_item_deletable(item_id: str):
    """Check if a menu item can be deleted (not used in any orders)"""
    # Check if item exists in any order
    orders = await db.restaurant_orders.find(
        {"items.menu_item_id": item_id}
    ).to_list(1)
    
    if orders:
        return {"can_delete": False, "reason": "This item has been used in existing orders and cannot be deleted."}
    return {"can_delete": True, "reason": ""}

# Reports and Analytics Routes
@api_router.get("/reports/daily")
async def get_daily_reports(start_date: Optional[str] = None, end_date: Optional[str] = None):
    # Default to last 30 days if no dates provided
    if not start_date or not end_date:
        end_date_obj = datetime.now().date()
        start_date_obj = end_date_obj - timedelta(days=30)
    else:
        start_date_obj = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_date_obj = datetime.strptime(end_date, '%Y-%m-%d').date()
    
    daily_data = []
    current_date = start_date_obj
    
    while current_date <= end_date_obj:
        start_datetime = datetime.combine(current_date, datetime.min.time())
        end_datetime = datetime.combine(current_date, datetime.max.time())
        
        # Calculate daily revenue from actual daily sales (payment collected)
        room_revenue = 0
        daily_sales = await db.daily_sales.find({
            "date": {"$gte": start_datetime, "$lte": end_datetime}
        }).to_list(1000)
        
        for sale in daily_sales:
            room_revenue += sale.get("total_amount", 0)
        
        # Calculate additional income (non-room income)
        additional_income = 0
        incomes = await db.incomes.find({
            "income_date": {"$gte": start_datetime, "$lte": end_datetime}
        }).to_list(1000)
        
        for income in incomes:
            additional_income += income.get("amount", 0)
        
        # Total daily revenue = room revenue + additional income
        daily_revenue = room_revenue + additional_income
        
        # Calculate daily expenses
        daily_expenses = 0
        expenses = await db.expenses.find({
            "expense_date": {"$gte": start_datetime, "$lte": end_datetime}
        }).to_list(1000)
        
        for expense in expenses:
            daily_expenses += expense.get("amount", 0)
        
        daily_profit = daily_revenue - daily_expenses
        
        daily_data.append({
            "date": current_date.strftime('%Y-%m-%d'),
            "revenue": daily_revenue,
            "room_revenue": room_revenue,
            "additional_income": additional_income,
            "expenses": daily_expenses,
            "profit": daily_profit,
            "sales_count": len(daily_sales),
            "expenses_count": len(expenses)
        })
        
        current_date += timedelta(days=1)
    
    return daily_data

@api_router.get("/reports/monthly")
async def get_monthly_reports(year: Optional[int] = None):
    if not year:
        year = datetime.now().year
    
    monthly_data = []
    
    for month in range(1, 13):
        start_date = datetime(year, month, 1)
        if month == 12:
            end_date = datetime(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = datetime(year, month + 1, 1) - timedelta(days=1)
        
        # Calculate monthly revenue from actual daily sales (payment collected)
        monthly_revenue = 0
        daily_sales = await db.daily_sales.find({
            "date": {"$gte": start_date, "$lte": end_date}
        }).to_list(1000)
        
        for sale in daily_sales:
            monthly_revenue += sale.get("total_amount", 0)
        
        # Calculate monthly expenses
        monthly_expenses = 0
        expenses = await db.expenses.find({
            "expense_date": {"$gte": start_date, "$lte": end_date}
        }).to_list(1000)
        
        for expense in expenses:
            monthly_expenses += expense.get("amount", 0)
        
        monthly_profit = monthly_revenue - monthly_expenses
        
        # Calculate occupancy rate based on bookings
        total_rooms = await db.rooms.count_documents({})
        completed_bookings = await db.bookings.find({
            "status": "Completed",
            "check_out_date": {"$gte": start_date, "$lte": end_date}
        }).to_list(1000)
        
        occupied_days = len(completed_bookings)
        days_in_month = (end_date - start_date).days + 1
        occupancy_rate = (occupied_days / (total_rooms * days_in_month)) * 100 if total_rooms > 0 else 0
        
        monthly_data.append({
            "month": month,
            "month_name": start_date.strftime('%B'),
            "revenue": monthly_revenue,
            "expenses": monthly_expenses,
            "profit": monthly_profit,
            "sales_count": len(daily_sales),
            "occupancy_rate": round(occupancy_rate, 2)
        })
    
    return monthly_data

@api_router.get("/reports/comparison")
async def get_month_comparison():
    current_date = datetime.now()
    current_month_start = datetime(current_date.year, current_date.month, 1)
    
    # Last month calculation
    if current_date.month == 1:
        last_month_start = datetime(current_date.year - 1, 12, 1)
        last_month_end = datetime(current_date.year, 1, 1) - timedelta(days=1)
    else:
        last_month_start = datetime(current_date.year, current_date.month - 1, 1)
        last_month_end = datetime(current_date.year, current_date.month, 1) - timedelta(days=1)
    
    current_month_end = current_date
    
    async def get_month_data(start_date, end_date, label):
        # Revenue calculation from actual daily sales (payment collected)
        revenue = 0
        daily_sales = await db.daily_sales.find({
            "date": {"$gte": start_date, "$lte": end_date}
        }).to_list(1000)
        
        for sale in daily_sales:
            revenue += sale.get("total_amount", 0)
        
        # Expenses calculation
        expenses = 0
        expense_records = await db.expenses.find({
            "expense_date": {"$gte": start_date, "$lte": end_date}
        }).to_list(1000)
        
        for expense in expense_records:
            expenses += expense.get("amount", 0)
        
        profit = revenue - expenses
        
        return {
            "period": label,
            "revenue": revenue,
            "expenses": expenses,
            "profit": profit,
            "sales_count": len(daily_sales),
            "expenses_count": len(expense_records)
        }
    
    last_month_data = await get_month_data(last_month_start, last_month_end, "Last Month")
    current_month_data = await get_month_data(current_month_start, current_month_end, "Current Month")
    
    # Calculate percentage changes
    def calculate_change(current, previous):
        if previous == 0:
            return 100 if current > 0 else 0
        return round(((current - previous) / previous) * 100, 2)
    
    comparison = {
        "last_month": last_month_data,
        "current_month": current_month_data,
        "changes": {
            "revenue_change": calculate_change(current_month_data["revenue"], last_month_data["revenue"]),
            "expenses_change": calculate_change(current_month_data["expenses"], last_month_data["expenses"]),
            "profit_change": calculate_change(current_month_data["profit"], last_month_data["profit"]),
            "sales_change": calculate_change(current_month_data["sales_count"], last_month_data["sales_count"])
        }
    }
    
    return comparison

# Expense Management Routes
@api_router.get("/expenses", response_model=List[Expense])
async def get_expenses():
    expenses = await db.expenses.find().sort("expense_date", -1).to_list(1000)
    
    # Convert datetime back to date for response
    for expense in expenses:
        if isinstance(expense.get('expense_date'), datetime):
            expense['expense_date'] = expense['expense_date'].date()
    
    return [Expense(**expense) for expense in expenses]

@api_router.post("/expenses", response_model=Expense)
async def create_expense(expense: ExpenseCreate):
    expense_dict = expense.dict()
    
    # Convert date string to date object if needed
    if isinstance(expense_dict.get('expense_date'), str):
        expense_dict['expense_date'] = datetime.strptime(expense_dict['expense_date'], '%Y-%m-%d').date()
    
    # Set payment_status based on payment_method
    if expense_dict.get('payment_method') == 'Add to Account':
        expense_dict['payment_status'] = 'Pending'
    else:
        expense_dict['payment_status'] = 'Paid'
    
    expense_obj = Expense(**expense_dict)
    
    # Convert date to datetime for MongoDB storage
    expense_storage = expense_obj.dict()
    if expense_storage.get('expense_date'):
        expense_storage['expense_date'] = datetime.combine(expense_storage['expense_date'], datetime.min.time())
    
    # Auto-save vendor if new
    if expense.vendor and expense.vendor.strip():
        existing_vendor = await db.vendors.find_one({"name": expense.vendor.strip()})
        if not existing_vendor:
            await db.vendors.insert_one({
                "id": str(uuid.uuid4()),
                "name": expense.vendor.strip(),
                "created_at": datetime.utcnow()
            })
    
    await db.expenses.insert_one(expense_storage)
    
    # Log activity
    await log_activity(
        action="expense_added",
        description=f"New expense added: {expense.description} - LKR {expense.amount}",
        entity_type="expense",
        entity_id=expense_obj.id,
        details={
            "description": expense.description,
            "amount": expense.amount,
            "category": expense.category,
            "vendor": expense.vendor,
            "payment_status": expense_obj.payment_status
        }
    )
    
    return expense_obj

@api_router.put("/expenses/{expense_id}/mark-paid")
async def mark_expense_paid(expense_id: str, data: dict):
    """Mark a pending expense as paid"""
    payment_method = data.get("payment_method", "Cash")
    expense = await db.expenses.find_one({"id": expense_id})
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    await db.expenses.update_one(
        {"id": expense_id},
        {"$set": {
            "payment_status": "Paid",
            "payment_method": payment_method,
            "paid_date": datetime.combine(datetime.now().date(), datetime.min.time())
        }}
    )
    return {"message": "Expense marked as paid"}

@api_router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str):
    result = await db.expenses.delete_one({"id": expense_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    return {"message": "Expense deleted successfully"}

# Vendor Management
@api_router.get("/vendors")
async def get_vendors(search: Optional[str] = None):
    """Get all vendors, optionally filtered by search term"""
    query = {}
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    vendors = await db.vendors.find(query, {"_id": 0}).sort("name", 1).to_list(100)
    return [v["name"] for v in vendors]

@api_router.post("/vendors")
async def add_vendor(data: dict):
    """Add a new vendor"""
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Vendor name is required")
    existing = await db.vendors.find_one({"name": name})
    if existing:
        raise HTTPException(status_code=400, detail="Vendor already exists")
    await db.vendors.insert_one({
        "id": str(uuid.uuid4()),
        "name": name,
        "created_at": datetime.utcnow()
    })
    return {"message": f"Vendor '{name}' added", "name": name}

# Income Management Routes
@api_router.get("/incomes", response_model=List[Income])
async def get_incomes():
    incomes = await db.incomes.find({}, {"_id": 0}).sort("income_date", -1).to_list(1000)
    
    # Convert datetime back to date for response
    for income in incomes:
        if isinstance(income.get('income_date'), datetime):
            income['income_date'] = income['income_date'].date()
    
    return [Income(**income) for income in incomes]

@api_router.post("/incomes", response_model=Income)
async def create_income(income: IncomeCreate):
    income_dict = income.dict()
    
    # Convert date string to date object if needed
    if isinstance(income_dict.get('income_date'), str):
        income_dict['income_date'] = datetime.strptime(income_dict['income_date'], '%Y-%m-%d').date()
    
    income_obj = Income(**income_dict)
    
    # Convert date to datetime for MongoDB storage
    income_storage = income_obj.dict()
    if income_storage.get('income_date'):
        income_storage['income_date'] = datetime.combine(income_storage['income_date'], datetime.min.time())
    
    await db.incomes.insert_one(income_storage)
    
    # Log activity
    await log_activity(
        action="income_added",
        description=f"New income added: {income.description} - LKR {income.amount}",
        entity_type="income",
        entity_id=income_obj.id,
        details={
            "description": income.description,
            "amount": income.amount,
            "category": income.category
        }
    )
    
    return income_obj

@api_router.delete("/incomes/{income_id}")
async def delete_income(income_id: str):
    result = await db.incomes.delete_one({"id": income_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Income not found")
    return {"message": "Income deleted successfully"}

# Dynamic Categories Management
@api_router.get("/categories/{category_type}")
async def get_categories(category_type: str):
    """Get categories for expense or income"""
    cats = await db.dynamic_categories.find(
        {"type": category_type}, {"_id": 0}
    ).sort("name", 1).to_list(100)
    return [c["name"] for c in cats]

@api_router.post("/categories/{category_type}")
async def add_category(
    category_type: str,
    data: dict,
    current_user: UserResponse = Depends(get_current_user)
):
    """Add a new category (admin only)"""
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Only admins can add categories")
    
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")
    
    existing = await db.dynamic_categories.find_one({"type": category_type, "name": name})
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    
    await db.dynamic_categories.insert_one({
        "id": str(uuid.uuid4()),
        "type": category_type,
        "name": name,
        "created_at": datetime.utcnow()
    })
    return {"message": f"Category '{name}' added", "name": name}

@api_router.delete("/categories/{category_type}/{name}")
async def delete_category(
    category_type: str,
    name: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Delete a category (admin only)"""
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Only admins can delete categories")
    
    result = await db.dynamic_categories.delete_one({"type": category_type, "name": name})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": f"Category '{name}' deleted"}

@api_router.get("/daily-sales")
async def get_daily_sales(start_date: Optional[str] = None, end_date: Optional[str] = None):
    # Default to current month if no dates provided
    if not start_date or not end_date:
        today = datetime.now().date()
        start_date_obj = today.replace(day=1)
        end_date_obj = today
    else:
        start_date_obj = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_date_obj = datetime.strptime(end_date, '%Y-%m-%d').date()
    
    # Convert dates to datetime for MongoDB query
    start_datetime = datetime.combine(start_date_obj, datetime.min.time())
    end_datetime = datetime.combine(end_date_obj, datetime.max.time())
    
    daily_sales = await db.daily_sales.find({
        "date": {"$gte": start_datetime, "$lte": end_datetime}
    }).sort("date", -1).to_list(1000)
    
    # Convert datetime back to date for response
    for sale in daily_sales:
        if isinstance(sale.get('date'), datetime):
            sale['date'] = sale['date'].date()
    
    return [DailySale(**sale) for sale in daily_sales]

@api_router.get("/financial-summary")
async def get_financial_summary(start_date: Optional[str] = None, end_date: Optional[str] = None):
    # Default to current month if no dates provided
    if not start_date or not end_date:
        today = datetime.now().date()
        start_date = today.replace(day=1)
        end_date = today
    else:
        start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
    
    # Convert dates to datetime for MongoDB query
    start_datetime = datetime.combine(start_date, datetime.min.time())
    end_datetime = datetime.combine(end_date, datetime.max.time())
    
    # Calculate revenue from actual daily sales (payment collected)
    daily_sales = await db.daily_sales.find({
        "date": {"$gte": start_datetime, "$lte": end_datetime}
    }).to_list(1000)
    
    room_revenue = 0
    revenue_breakdown = {}
    payment_method_breakdown = {}
    
    for sale in daily_sales:
        # Total revenue from actual payments collected
        sale_amount = sale.get("total_amount", 0)
        room_revenue += sale_amount
        
        # Revenue breakdown by room type (get room info for breakdown)
        room_number = sale.get("room_number", "")
        if room_number:
            room = await db.rooms.find_one({"room_number": room_number})
            if room:
                room_type = room.get("room_type", "Unknown")
                if room_type not in revenue_breakdown:
                    revenue_breakdown[room_type] = 0
                revenue_breakdown[room_type] += sale_amount
        
        # Payment method breakdown
        payment_method = sale.get("payment_method", "Unknown")
        if payment_method not in payment_method_breakdown:
            payment_method_breakdown[payment_method] = 0
        payment_method_breakdown[payment_method] += sale_amount
    
    # Calculate additional income (non-room income)
    additional_incomes = await db.incomes.find({
        "income_date": {"$gte": start_datetime, "$lte": end_datetime}
    }).to_list(1000)
    
    additional_income_total = 0
    income_breakdown = {}
    
    for income in additional_incomes:
        amount = income.get("amount", 0)
        additional_income_total += amount
        
        category = income.get("category", "Other")
        if category not in income_breakdown:
            income_breakdown[category] = 0
        income_breakdown[category] += amount
    
    # Total revenue = room revenue + additional income
    total_revenue = room_revenue + additional_income_total
    
    # Calculate expenses
    expenses = await db.expenses.find({
        "expense_date": {"$gte": start_datetime, "$lte": end_datetime}
    }).to_list(1000)
    
    total_expenses = 0
    expense_breakdown = {}
    
    for expense in expenses:
        amount = expense.get("amount", 0)
        total_expenses += amount
        
        category = expense.get("category", "Other")
        if category not in expense_breakdown:
            expense_breakdown[category] = 0
        expense_breakdown[category] += amount
    
    net_profit = total_revenue - total_expenses
    
    return {
        "total_revenue": total_revenue,
        "room_revenue": room_revenue,
        "additional_income": additional_income_total,
        "total_expenses": total_expenses,
        "net_profit": net_profit,
        "revenue_breakdown": revenue_breakdown,
        "income_breakdown": income_breakdown,
        "expense_breakdown": expense_breakdown,
        "payment_method_breakdown": payment_method_breakdown,
        "period_start": start_date,
        "period_end": end_date
    }

@api_router.get("/daily-financial-summary")
async def get_daily_financial_summary():
    """Get current day financial summary with running cash and bank balances, receivables and payables"""
    today = datetime.now().date()
    start_datetime = datetime.combine(today, datetime.min.time())
    end_datetime = datetime.combine(today, datetime.max.time())
    
    # Calculate today's revenue from daily sales
    daily_sales = await db.daily_sales.find({
        "date": {"$gte": start_datetime, "$lte": end_datetime}
    }).to_list(1000)
    
    today_revenue = sum(sale.get("total_amount", 0) for sale in daily_sales)
    
    # Calculate today's additional income
    additional_incomes = await db.incomes.find({
        "income_date": {"$gte": start_datetime, "$lte": end_datetime}
    }).to_list(1000)
    
    additional_income_total = sum(income.get("amount", 0) for income in additional_incomes)
    total_revenue = today_revenue + additional_income_total
    
    # Calculate today's expenses (only paid ones)
    expenses = await db.expenses.find({
        "expense_date": {"$gte": start_datetime, "$lte": end_datetime},
        "payment_status": {"$ne": "Pending"}
    }).to_list(1000)
    
    total_expenses = sum(expense.get("amount", 0) for expense in expenses)
    
    # Calculate running cash and bank balances (cumulative)
    all_sales = await db.daily_sales.find().to_list(10000)
    all_incomes = await db.incomes.find().to_list(10000)
    
    cash_balance = 0
    bank_balance = 0
    
    for sale in all_sales:
        amount = sale.get("total_amount", 0)
        payment_method = sale.get("payment_method", "Cash")
        if payment_method == "Cash":
            cash_balance += amount
        elif payment_method in ["Card", "Bank Transfer"]:
            bank_balance += amount
    
    for income in all_incomes:
        amount = income.get("amount", 0)
        payment_method = income.get("payment_method", "Cash")
        if payment_method == "Cash":
            cash_balance += amount
        elif payment_method in ["Card", "Bank Transfer"]:
            bank_balance += amount
    
    all_expenses = await db.expenses.find({"payment_status": {"$ne": "Pending"}}).to_list(10000)
    for expense in all_expenses:
        amount = expense.get("amount", 0)
        payment_method = expense.get("payment_method", "Cash")
        if payment_method == "Cash":
            cash_balance -= amount
        elif payment_method in ["Card", "Bank Transfer"]:
            bank_balance -= amount
    
    # Pending receivables (checked-in guests)
    checked_in = await db.bookings.find(
        {"status": "Checked In"}, {"guest_id_proof": 0}
    ).to_list(1000)
    total_receivables = sum(
        max(0, b.get("booking_amount", 0) - b.get("advance_amount", 0))
        for b in checked_in
    )
    
    # Room bill restaurant orders
    room_bills = await db.restaurant_orders.find({
        "payment_status": "Room Bill", "order_status": {"$ne": "Cancelled"}
    }).to_list(1000)
    total_receivables += sum(o.get("total_amount", 0) for o in room_bills)
    
    # Pending payables
    pending_expenses = await db.expenses.find({"payment_status": "Pending"}).to_list(1000)
    total_payables = sum(e.get("amount", 0) for e in pending_expenses)
    
    return {
        "total_revenue": total_revenue,
        "total_expenses": total_expenses,
        "cash_balance": cash_balance,
        "bank_balance": bank_balance,
        "pending_receivables": round(total_receivables, 2),
        "pending_payables": round(total_payables, 2),
        "date": today
    }

@api_router.get("/financial-reports/daily")
async def get_daily_financial_report(
    date: Optional[str] = None,
    current_user: UserResponse = Depends(get_current_user)
):
    """Generate enhanced daily financial report with receivables and payables"""
    try:
        if date:
            target_date = datetime.strptime(date, '%Y-%m-%d').date()
        else:
            target_date = datetime.now().date()
        
        start_datetime = datetime.combine(target_date, datetime.min.time())
        end_datetime = datetime.combine(target_date, datetime.max.time())
        
        # --- AMOUNTS RECEIVED ---
        # 1. Room checkout/checkin payments (daily_sales)
        daily_sales = await db.daily_sales.find({
            "date": {"$gte": start_datetime, "$lte": end_datetime}
        }).to_list(1000)
        
        # 2. Additional income entries
        incomes = await db.incomes.find({
            "income_date": {"$gte": start_datetime, "$lte": end_datetime}
        }).to_list(1000)
        
        # Calculate received by payment method
        received_cash = 0
        received_bank = 0
        received_details = []
        
        for sale in daily_sales:
            amt = sale.get("total_amount", 0)
            pm = sale.get("payment_method", "Cash")
            if pm == "Cash":
                received_cash += amt
            else:
                received_bank += amt
            received_details.append({
                "Type": "Room Booking",
                "Description": f"Room {sale.get('room_number', '')} - {sale.get('customer_name', '')}",
                "Category": sale.get("sale_type", "room_booking").replace("_", " ").title(),
                "Amount": amt,
                "Payment Method": pm
            })
        
        for income in incomes:
            amt = income.get("amount", 0)
            pm = income.get("payment_method", "Cash")
            if pm == "Cash":
                received_cash += amt
            else:
                received_bank += amt
            received_details.append({
                "Type": "Income",
                "Description": income.get("description", ""),
                "Category": income.get("category", "General"),
                "Amount": amt,
                "Payment Method": pm
            })
        
        total_received = received_cash + received_bank
        
        # --- AMOUNTS PAID ---
        expenses = await db.expenses.find({
            "expense_date": {"$gte": start_datetime, "$lte": end_datetime},
            "payment_status": {"$ne": "Pending"}
        }).to_list(1000)
        
        paid_cash = 0
        paid_bank = 0
        paid_details = []
        
        for expense in expenses:
            amt = expense.get("amount", 0)
            pm = expense.get("payment_method", "Cash")
            if pm == "Cash":
                paid_cash += amt
            elif pm in ["Card", "Bank Transfer"]:
                paid_bank += amt
            paid_details.append({
                "Description": expense.get("description", ""),
                "Category": expense.get("category", "General"),
                "Vendor": expense.get("vendor", ""),
                "Amount": amt,
                "Payment Method": pm
            })
        
        total_paid = paid_cash + paid_bank
        
        # --- PENDING RECEIVABLES ---
        checked_in_guests = await db.bookings.find({
            "status": "Checked In"
        }, {"guest_id_proof": 0}).to_list(1000)
        
        receivable_details = []
        total_receivables = 0
        for guest in checked_in_guests:
            booking_amt = guest.get("booking_amount", 0)
            advance = guest.get("advance_amount", 0)
            pending = booking_amt - advance
            if pending > 0:
                receivable_details.append({
                    "Guest": guest.get("guest_name", "N/A"),
                    "Room": guest.get("room_number", ""),
                    "Booking Amount": booking_amt,
                    "Advance Paid": advance,
                    "Pending Amount": pending,
                    "Check In": guest.get("check_in_date", "").strftime("%Y-%m-%d") if isinstance(guest.get("check_in_date"), datetime) else str(guest.get("check_in_date", ""))
                })
                total_receivables += pending
        
        # Restaurant room bills (unpaid)
        room_bill_orders = await db.restaurant_orders.find({
            "payment_status": "Room Bill",
            "order_status": {"$ne": "Cancelled"}
        }).to_list(1000)
        
        for order in room_bill_orders:
            amt = order.get("total_amount", 0)
            receivable_details.append({
                "Guest": f"Room {order.get('room_number', 'N/A')}",
                "Room": order.get("room_number", ""),
                "Booking Amount": 0,
                "Advance Paid": 0,
                "Pending Amount": amt,
                "Check In": "Restaurant Room Bill"
            })
            total_receivables += amt
        
        # --- PENDING PAYABLES ---
        pending_expenses = await db.expenses.find({
            "payment_status": "Pending"
        }).to_list(1000)
        
        payable_details = []
        total_payables = 0
        for exp in pending_expenses:
            amt = exp.get("amount", 0)
            payable_details.append({
                "Type": "Unpaid Bill",
                "Description": exp.get("description", ""),
                "Vendor": exp.get("vendor", "N/A"),
                "Category": exp.get("category", ""),
                "Amount": amt,
                "Date": exp.get("expense_date", "").strftime("%Y-%m-%d") if isinstance(exp.get("expense_date"), datetime) else str(exp.get("expense_date", ""))
            })
            total_payables += amt
        
        # Channel commissions due
        all_channels = await db.booking_channels.find({}, {"_id": 0}).to_list(100)
        channel_map = {ch.get("name", ""): ch for ch in all_channels}
        
        completed_bookings = await db.bookings.find({
            "status": {"$in": ["Checked In", "Completed"]},
            "booking_channel_name": {"$ne": "Direct"}
        }, {"guest_id_proof": 0}).to_list(10000)
        
        commission_by_channel = {}
        for bk in completed_bookings:
            ch_name = bk.get("booking_channel_name", "")
            ch_info = channel_map.get(ch_name, {})
            if ch_info.get("auto_rate") and ch_info.get("commission_rate", 0) > 0:
                commission = bk.get("booking_amount", 0) * ch_info["commission_rate"] / 100
                if ch_name not in commission_by_channel:
                    commission_by_channel[ch_name] = 0
                commission_by_channel[ch_name] += commission
        
        for ch_name, commission in commission_by_channel.items():
            if commission > 0:
                payable_details.append({
                    "Type": "Channel Commission",
                    "Description": f"Commission for {ch_name}",
                    "Vendor": ch_name,
                    "Category": "Commission",
                    "Amount": round(commission, 2),
                    "Date": ""
                })
                total_payables += commission
        
        total_payables = round(total_payables, 2)
        
        net_position = total_received - total_paid
        
        return {
            "date": target_date.strftime("%Y-%m-%d"),
            "received": {
                "cash": received_cash,
                "bank": received_bank,
                "total": total_received,
                "details": received_details
            },
            "paid": {
                "cash": paid_cash,
                "bank": paid_bank,
                "total": total_paid,
                "details": paid_details
            },
            "pending_receivables": {
                "total": total_receivables,
                "details": receivable_details
            },
            "pending_payables": {
                "total": total_payables,
                "details": payable_details
            },
            "net_position": net_position,
            "summary": {
                "Cash Income (LKR)": received_cash,
                "Bank Income (LKR)": received_bank,
                "Total Income (LKR)": total_received,
                "Cash Expenses (LKR)": paid_cash,
                "Bank Expenses (LKR)": paid_bank,
                "Total Expenses (LKR)": total_paid,
                "Pending Receivables (LKR)": total_receivables,
                "Pending Payables (LKR)": total_payables,
                "Net Position (LKR)": net_position
            },
            "income_details": received_details,
            "expense_details": paid_details,
            "cash_balance": received_cash - paid_cash,
            "bank_balance": received_bank - paid_bank,
            "total_balance": net_position,
            "total_income": total_received,
            "total_expenses": total_paid
        }
        
    except Exception as e:
        print(f"Daily report error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate daily report: {str(e)}")

@api_router.get("/financial-reports/monthly")
async def get_monthly_financial_report(
    year: int = None,
    month: int = None,
    current_user: UserResponse = Depends(get_current_user)
):
    """Generate enhanced monthly financial report with day-by-day breakdown"""
    try:
        if year is None or month is None:
            today = datetime.now().date()
            year = today.year
            month = today.month
        
        import calendar
        days_in_month = calendar.monthrange(year, month)[1]
        start_date = datetime(year, month, 1)
        end_date = datetime(year, month, days_in_month, 23, 59, 59)
        
        month_names = ["", "January", "February", "March", "April", "May", "June", 
                      "July", "August", "September", "October", "November", "December"]
        
        # Fetch all data for the month at once
        all_daily_sales = await db.daily_sales.find({
            "date": {"$gte": start_date, "$lte": end_date}
        }).to_list(10000)
        
        all_incomes = await db.incomes.find({
            "income_date": {"$gte": start_date, "$lte": end_date}
        }).to_list(10000)
        
        all_expenses = await db.expenses.find({
            "expense_date": {"$gte": start_date, "$lte": end_date}
        }).to_list(10000)
        
        # Build day-by-day breakdown
        daily_breakdown = []
        grand_received_cash = 0
        grand_received_bank = 0
        grand_paid_cash = 0
        grand_paid_bank = 0
        grand_pending_payables = 0
        
        for day in range(1, days_in_month + 1):
            day_start = datetime(year, month, day, 0, 0, 0)
            day_end = datetime(year, month, day, 23, 59, 59)
            
            # Filter sales for this day
            day_sales = [s for s in all_daily_sales 
                        if day_start <= s.get("date", datetime.min) <= day_end]
            day_incomes = [i for i in all_incomes 
                          if day_start <= i.get("income_date", datetime.min) <= day_end]
            day_expenses = [e for e in all_expenses 
                           if day_start <= e.get("expense_date", datetime.min) <= day_end]
            
            # Received
            rc = sum(s.get("total_amount", 0) for s in day_sales if s.get("payment_method", "Cash") == "Cash")
            rc += sum(i.get("amount", 0) for i in day_incomes if i.get("payment_method", "Cash") == "Cash")
            
            rb = sum(s.get("total_amount", 0) for s in day_sales if s.get("payment_method", "Cash") in ["Card", "Bank Transfer"])
            rb += sum(i.get("amount", 0) for i in day_incomes if i.get("payment_method", "Cash") in ["Card", "Bank Transfer"])
            
            # Paid (only actually paid expenses)
            pc = sum(e.get("amount", 0) for e in day_expenses 
                    if e.get("payment_method", "Cash") == "Cash" and e.get("payment_status", "Paid") != "Pending")
            pb = sum(e.get("amount", 0) for e in day_expenses 
                    if e.get("payment_method", "Cash") in ["Card", "Bank Transfer"] and e.get("payment_status", "Paid") != "Pending")
            
            # Pending payables for the day
            pp = sum(e.get("amount", 0) for e in day_expenses if e.get("payment_status") == "Pending")
            
            total_received = rc + rb
            total_paid = pc + pb
            net = total_received - total_paid
            
            grand_received_cash += rc
            grand_received_bank += rb
            grand_paid_cash += pc
            grand_paid_bank += pb
            grand_pending_payables += pp
            
            daily_breakdown.append({
                "date": f"{year}-{month:02d}-{day:02d}",
                "day": day,
                "received_cash": round(rc, 2),
                "received_bank": round(rb, 2),
                "total_received": round(total_received, 2),
                "paid_cash": round(pc, 2),
                "paid_bank": round(pb, 2),
                "total_paid": round(total_paid, 2),
                "pending_payables": round(pp, 2),
                "net_balance": round(net, 2),
                "transactions": len(day_sales) + len(day_incomes) + len(day_expenses)
            })
        
        grand_total_received = grand_received_cash + grand_received_bank
        grand_total_paid = grand_paid_cash + grand_paid_bank
        grand_net = grand_total_received - grand_total_paid
        
        # Income details for the whole month
        income_details = []
        for sale in all_daily_sales:
            income_details.append({
                "Date": sale.get("date", "").strftime("%Y-%m-%d") if isinstance(sale.get("date"), datetime) else "",
                "Guest Name": sale.get("customer_name", "N/A"),
                "Category": sale.get("sale_type", "Room Booking").replace("_", " ").title(),
                "Description": f"Room {sale.get('room_number', '')}",
                "Amount": sale.get("total_amount", 0),
                "Payment Method": sale.get("payment_method", "Cash")
            })
        for income in all_incomes:
            income_details.append({
                "Date": income.get("income_date", "").strftime("%Y-%m-%d") if isinstance(income.get("income_date"), datetime) else "",
                "Guest Name": income.get("guest_name", "N/A"),
                "Category": income.get("category", "General"),
                "Description": income.get("description", ""),
                "Amount": income.get("amount", 0),
                "Payment Method": income.get("payment_method", "Cash")
            })
        
        expense_details = []
        for expense in all_expenses:
            expense_details.append({
                "Date": expense.get("expense_date", "").strftime("%Y-%m-%d") if isinstance(expense.get("expense_date"), datetime) else "",
                "Category": expense.get("category", "General"),
                "Description": expense.get("description", ""),
                "Vendor": expense.get("vendor", ""),
                "Amount": expense.get("amount", 0),
                "Payment Method": expense.get("payment_method", "Cash"),
                "Status": expense.get("payment_status", "Paid")
            })
        
        return {
            "month": f"{month_names[month]} {year}",
            "year": year,
            "month_number": month,
            "days_in_month": days_in_month,
            "daily_breakdown": daily_breakdown,
            "grand_totals": {
                "received_cash": round(grand_received_cash, 2),
                "received_bank": round(grand_received_bank, 2),
                "total_received": round(grand_total_received, 2),
                "paid_cash": round(grand_paid_cash, 2),
                "paid_bank": round(grand_paid_bank, 2),
                "total_paid": round(grand_total_paid, 2),
                "pending_payables": round(grand_pending_payables, 2),
                "net_balance": round(grand_net, 2)
            },
            "income_details": income_details,
            "expense_details": expense_details,
            "summary": {
                "Cash Income (LKR)": round(grand_received_cash, 2),
                "Bank Income (LKR)": round(grand_received_bank, 2),
                "Total Income (LKR)": round(grand_total_received, 2),
                "Cash Expenses (LKR)": round(grand_paid_cash, 2),
                "Bank Expenses (LKR)": round(grand_paid_bank, 2),
                "Total Expenses (LKR)": round(grand_total_paid, 2),
                "Pending Payables (LKR)": round(grand_pending_payables, 2),
                "Net Balance (LKR)": round(grand_net, 2)
            },
            "cash_balance": round(grand_received_cash - grand_paid_cash, 2),
            "bank_balance": round(grand_received_bank - grand_paid_bank, 2),
            "total_balance": round(grand_net, 2),
            "total_income": round(grand_total_received, 2),
            "total_expenses": round(grand_total_paid, 2)
        }
        
    except Exception as e:
        print(f"Monthly report error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate monthly report: {str(e)}")

# Restaurant Management Routes

# Menu Categories
@api_router.get("/restaurant/categories")
async def get_menu_categories(current_user: UserResponse = Depends(get_current_user)):
    """Get all menu categories"""
    categories = await db.menu_categories.find({"is_active": True}).sort("display_order", 1).to_list(100)
    return [MenuCategory(**category) for category in categories]

@api_router.post("/restaurant/categories")
async def create_menu_category(
    category: MenuCategoryCreate, 
    current_user: UserResponse = Depends(get_current_user)
):
    """Create a new menu category"""
    if current_user.role not in ["Admin", "Restaurant Manager"]:
        raise HTTPException(status_code=403, detail="Access denied. Only Admin or Restaurant Manager can manage categories.")
    
    # Check if category name already exists
    existing = await db.menu_categories.find_one({"name": category.name, "is_active": True})
    if existing:
        raise HTTPException(status_code=400, detail="Category name already exists")
    
    new_category = MenuCategory(**category.dict())
    await db.menu_categories.insert_one(new_category.dict())
    
    return new_category

@api_router.put("/restaurant/categories/{category_id}")
async def update_menu_category(
    category_id: str,
    category: MenuCategoryCreate,
    current_user: UserResponse = Depends(get_current_user)
):
    """Update a menu category"""
    if current_user.role not in ["Admin", "Restaurant Manager"]:
        raise HTTPException(status_code=403, detail="Access denied.")
    
    result = await db.menu_categories.update_one(
        {"id": category_id},
        {"$set": category.dict()}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    
    return {"message": "Category updated successfully"}

@api_router.delete("/restaurant/categories/{category_id}")
async def delete_menu_category(
    category_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Delete a menu category"""
    if current_user.role not in ["Admin", "Restaurant Manager"]:
        raise HTTPException(status_code=403, detail="Access denied.")
    
    # Check if category has menu items
    items = await db.menu_items.find({"category_id": category_id, "is_available": True}).to_list(1)
    if items:
        raise HTTPException(status_code=400, detail="Cannot delete category with active menu items")
    
    # Check if category items are in active orders
    active_orders = await db.restaurant_orders.find({
        "payment_status": "Pending",
        "items.menu_item_id": {"$in": [item["id"] for item in items]}
    }).to_list(1)
    if active_orders:
        raise HTTPException(status_code=400, detail="Cannot delete category with items in active orders")
    
    result = await db.menu_categories.update_one(
        {"id": category_id},
        {"$set": {"is_active": False}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    
    return {"message": "Category deleted successfully"}

# Menu Items
@api_router.get("/restaurant/menu-items")
async def get_menu_items(category_id: Optional[str] = None, current_user: UserResponse = Depends(get_current_user)):
    """Get all menu items, optionally filtered by category"""
    query = {"is_available": True}
    if category_id:
        query["category_id"] = category_id
    
    items = await db.menu_items.find(query).to_list(1000)
    return [MenuItem(**item) for item in items]

@api_router.post("/restaurant/menu-items")
async def create_menu_item(
    item: MenuItemCreate,
    current_user: UserResponse = Depends(get_current_user)
):
    """Create a new menu item"""
    if current_user.role not in ["Admin", "Restaurant Manager"]:
        raise HTTPException(status_code=403, detail="Access denied.")
    
    # Verify category exists
    category = await db.menu_categories.find_one({"id": item.category_id, "is_active": True})
    if not category:
        raise HTTPException(status_code=400, detail="Invalid category ID")
    
    new_item = MenuItem(**item.dict())
    await db.menu_items.insert_one(new_item.dict())
    
    return new_item

# NOTE: The update_menu_item endpoint has been moved above (around line 5059) 
# with enhanced stock sync feature. This duplicate was removed to prevent conflicts.

@api_router.delete("/restaurant/menu-items/{item_id}")
async def delete_menu_item(
    item_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Delete a menu item - blocked if used in any orders"""
    if current_user.role not in ["Admin", "Restaurant Manager"]:
        raise HTTPException(status_code=403, detail="Access denied.")
    
    # Check if item is in ANY orders (not just active ones)
    any_orders = await db.restaurant_orders.find({
        "items.menu_item_id": item_id
    }).to_list(1)
    if any_orders:
        raise HTTPException(status_code=400, detail="This item has been used in existing orders and cannot be deleted.")
    
    result = await db.menu_items.delete_one({"id": item_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Menu item not found")
    
    return {"message": "Menu item deleted successfully"}

# Restaurant Tables
@api_router.get("/restaurant/tables")
async def get_restaurant_tables(current_user: UserResponse = Depends(get_current_user)):
    """Get all restaurant tables"""
    tables = await db.restaurant_tables.find({"is_active": True}).sort("table_number", 1).to_list(1000)
    return [RestaurantTable(**table) for table in tables]

@api_router.post("/restaurant/tables")
async def create_restaurant_table(
    table: RestaurantTableCreate,
    current_user: UserResponse = Depends(get_current_user)
):
    """Create a new restaurant table"""
    if current_user.role not in ["Admin", "Restaurant Manager"]:
        raise HTTPException(status_code=403, detail="Access denied.")
    
    # Check if table number already exists
    existing = await db.restaurant_tables.find_one({"table_number": table.table_number, "is_active": True})
    if existing:
        raise HTTPException(status_code=400, detail="Table number already exists")
    
    new_table = RestaurantTable(**table.dict())
    await db.restaurant_tables.insert_one(new_table.dict())
    
    return new_table

@api_router.put("/restaurant/tables/{table_id}")
async def update_restaurant_table(
    table_id: str,
    table: RestaurantTableCreate,
    current_user: UserResponse = Depends(get_current_user)
):
    """Update a restaurant table"""
    if current_user.role not in ["Admin", "Restaurant Manager"]:
        raise HTTPException(status_code=403, detail="Access denied.")
    
    result = await db.restaurant_tables.update_one(
        {"id": table_id},
        {"$set": table.dict()}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Table not found")
    
    return {"message": "Table updated successfully"}

@api_router.delete("/restaurant/tables/{table_id}")
async def delete_restaurant_table(
    table_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Delete a restaurant table"""
    if current_user.role not in ["Admin", "Restaurant Manager"]:
        raise HTTPException(status_code=403, detail="Access denied.")
    
    result = await db.restaurant_tables.update_one(
        {"id": table_id},
        {"$set": {"is_active": False}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Table not found")
    
    return {"message": "Table deleted successfully"}

# Restaurant Staff
@api_router.get("/restaurant/staff")
async def get_restaurant_staff(current_user: UserResponse = Depends(get_current_user)):
    """Get all restaurant staff"""
    staff = await db.restaurant_staff.find({"is_active": True}).sort("name", 1).to_list(1000)
    return [RestaurantStaff(**member) for member in staff]

@api_router.post("/restaurant/staff")
async def create_restaurant_staff(
    staff: RestaurantStaffCreate,
    current_user: UserResponse = Depends(get_current_user)
):
    """Create a new restaurant staff member"""
    if current_user.role not in ["Admin", "Restaurant Manager"]:
        raise HTTPException(status_code=403, detail="Access denied.")
    
    new_staff = RestaurantStaff(**staff.dict())
    await db.restaurant_staff.insert_one(new_staff.dict())
    
    return new_staff

@api_router.put("/restaurant/staff/{staff_id}")
async def update_restaurant_staff(
    staff_id: str,
    staff: RestaurantStaffCreate,
    current_user: UserResponse = Depends(get_current_user)
):
    """Update a restaurant staff member"""
    if current_user.role not in ["Admin", "Restaurant Manager"]:
        raise HTTPException(status_code=403, detail="Access denied.")
    
    result = await db.restaurant_staff.update_one(
        {"id": staff_id},
        {"$set": staff.dict()}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Staff member not found")
    
    return {"message": "Staff member updated successfully"}

@api_router.delete("/restaurant/staff/{staff_id}")
async def delete_restaurant_staff(
    staff_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Delete a restaurant staff member"""
    if current_user.role not in ["Admin", "Restaurant Manager"]:
        raise HTTPException(status_code=403, detail="Access denied.")
    
    result = await db.restaurant_staff.update_one(
        {"id": staff_id},
        {"$set": {"is_active": False}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Staff member not found")
    
    return {"message": "Staff member deleted successfully"}

# Restaurant Orders
@api_router.get("/restaurant/orders")
async def get_restaurant_orders(
    status: Optional[str] = None,
    order_type: Optional[str] = None,
    current_user: UserResponse = Depends(get_current_user)
):
    """Get restaurant orders with optional filtering"""
    query = {}
    if status:
        query["order_status"] = status
    if order_type:
        query["order_type"] = order_type
    
    orders = await db.restaurant_orders.find(query).sort("order_date", -1).to_list(1000)
    return [RestaurantOrder(**order) for order in orders]

@api_router.post("/restaurant/orders")
async def create_restaurant_order(
    order: RestaurantOrderCreate,
    current_user: UserResponse = Depends(get_current_user)
):
    """Create a new restaurant order with applicable taxes"""
    # Generate order number
    order_count = await db.restaurant_orders.count_documents({})
    order_number = f"R{str(order_count + 1).zfill(4)}"
    
    # Calculate subtotal
    subtotal = sum(item.total_price for item in order.items)
    
    # Calculate restaurant taxes using the new tax system
    tax_result = await calculate_restaurant_taxes(subtotal)
    tax_amount = tax_result["total_tax"]
    tax_breakdown = tax_result["tax_breakdown"]
    
    # Service charge (configurable rate from order)
    service_charge = subtotal * (order.service_charge_rate / 100)
    
    # Total = subtotal + taxes + service charge
    total_amount = subtotal + tax_amount + service_charge
    
    # Get table/staff details
    table_number = None
    waiter_name = ""
    
    if order.table_id:
        table = await db.restaurant_tables.find_one({"id": order.table_id})
        if table:
            table_number = table["table_number"]
        
        # Update table status to Occupied
        await db.restaurant_tables.update_one(
            {"id": order.table_id},
            {"$set": {"status": "Occupied"}}
        )
    
    if order.waiter_id:
        waiter = await db.restaurant_staff.find_one({"id": order.waiter_id})
        if waiter:
            waiter_name = waiter["name"]
    
    # Create order
    new_order = RestaurantOrder(
        order_number=order_number,
        order_type=order.order_type,
        table_id=order.table_id,
        table_number=table_number,
        room_number=order.room_number,
        customer_name=order.customer_name,
        items=order.items,
        subtotal=subtotal,
        tax_amount=tax_amount,
        service_charge=service_charge,
        total_amount=total_amount,
        payment_method="Pending",  # Will be set during payment
        waiter_id=order.waiter_id,
        waiter_name=waiter_name,
        notes=order.notes,
        created_by=current_user.username
    )
    
    # Add tax breakdown to order
    order_dict = new_order.dict()
    order_dict["tax_breakdown"] = tax_breakdown
    
    await db.restaurant_orders.insert_one(order_dict)
    
    # Deduct stock for items with stock tracking enabled
    order_items_for_stock = [{"item_id": item.menu_item_id, "name": item.menu_item_name, "quantity": item.quantity} for item in order.items]
    await deduct_stock_for_order(order_items_for_stock, new_order.id, current_user.username)
    
    # NOTE: Restaurant charges are ONLY added to room bill when the user explicitly
    # chooses "Add to Room Bill" during payment. This prevents double-counting
    # when customers pay directly at the restaurant.
    
    # Return order with tax breakdown
    response = new_order.dict()
    response["tax_breakdown"] = tax_breakdown
    return response

@api_router.put("/restaurant/orders/{order_id}/status")
async def update_order_status(
    order_id: str,
    status: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Update order status"""
    valid_statuses = ["Pending", "Preparing", "Ready", "Served", "Cancelled"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    result = await db.restaurant_orders.update_one(
        {"id": order_id},
        {"$set": {"order_status": status}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    
    return {"message": f"Order status updated to {status}"}

@api_router.post("/restaurant/orders/{order_id}/pay")
async def pay_restaurant_order(
    order_id: str,
    payment_data: dict,
    current_user: UserResponse = Depends(get_current_user)
):
    """Process payment for restaurant order"""
    if current_user.role not in ["Admin", "Restaurant Manager"]:
        raise HTTPException(status_code=403, detail="Access denied.")
    
    order = await db.restaurant_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order["payment_status"] != "Pending":
        raise HTTPException(status_code=400, detail="Order already paid")
    
    payment_method = payment_data.get("payment_method", "Cash")
    add_to_room_bill = payment_data.get("add_to_room_bill", False)
    
    # Update order payment status
    await db.restaurant_orders.update_one(
        {"id": order_id},
        {"$set": {
            "payment_status": "Paid",
            "payment_method": payment_method,
            "order_status": "Completed",
            "paid_at": datetime.utcnow()
        }}
    )
    
    # Handle room service billing - only add to room bill if explicitly requested
    if order["order_type"] == "room_service" and add_to_room_bill:
        # Update status to Room Bill
        await db.restaurant_orders.update_one(
            {"id": order_id},
            {"$set": {"payment_status": "Room Bill", "order_status": "Completed"}}
        )
        
        # Add to customer's room charges - will be collected at checkout
        customer = await db.customers.find_one({
            "current_room": order["room_number"],
            "is_checked_out": False
        })
        if customer:
            current_charges = customer.get("restaurant_charges", 0.0)
            new_charges = current_charges + order["total_amount"]
            await db.customers.update_one(
                {"id": customer["id"]},
                {"$set": {"restaurant_charges": new_charges}}
            )
        
        # Log activity - added to room bill (no immediate income record)
        await db.activity_logs.insert_one({
            "id": str(uuid.uuid4()),
            "action": "restaurant_bill_added_to_room",
            "description": f"Added restaurant bill LKR {order['total_amount']:.2f} to Room {order['room_number']} (will be collected at checkout)",
            "user_name": current_user.username,
            "user_id": current_user.username,
            "entity_type": "restaurant_order",
            "entity_id": order_id,
            "details": {
                "order_number": order["order_number"],
                "room_number": order["room_number"],
                "amount": order["total_amount"],
                "customer_name": order.get("customer_name", "")
            },
            "timestamp": datetime.utcnow()
        })
    else:
        # Process immediate payment - create income record for financial tracking
        today = datetime.utcnow()
        today_date = datetime.combine(today.date(), datetime.min.time())
        
        # Add to income records for financial reporting
        await db.incomes.insert_one({
            "id": str(uuid.uuid4()),
            "description": f"Restaurant Order {order['order_number']}",
            "amount": order["total_amount"],
            "category": "Restaurant",
            "payment_method": payment_method,
            "income_date": today_date,
            "guest_name": order.get("customer_name", "Walk-in"),
            "created_by": current_user.username,
            "created_at": today
        })
        
        # Log activity - paid directly
        await db.activity_logs.insert_one({
            "id": str(uuid.uuid4()),
            "action": "restaurant_payment_processed",
            "description": f"Processed restaurant payment LKR {order['total_amount']:.2f} via {payment_method} for Order {order['order_number']}",
            "user_name": current_user.username,
            "user_id": current_user.username,
            "entity_type": "restaurant_order",
            "entity_id": order_id,
            "details": {
                "order_number": order["order_number"],
                "amount": order["total_amount"],
                "payment_method": payment_method,
                "customer_name": order.get("customer_name", "Walk-in")
            },
            "timestamp": datetime.utcnow()
        })
    
    # Free up table if it was a table order
    if order.get("table_id"):
        await db.restaurant_tables.update_one(
            {"id": order["table_id"]},
            {"$set": {"status": "Available"}}
        )
    
    return {"message": "Payment processed successfully", "payment_method": payment_method, "added_to_room_bill": add_to_room_bill}

@api_router.put("/restaurant/orders/{order_id}/items")
async def update_order_items(
    order_id: str,
    data: dict,
    current_user: UserResponse = Depends(get_current_user)
):
    """Update items in an existing order (only if not Room Bill)"""
    order = await db.restaurant_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("payment_status") == "Room Bill":
        raise HTTPException(status_code=400, detail="Cannot edit orders already sent to Room Bill")
    if order.get("payment_status") == "Paid":
        raise HTTPException(status_code=400, detail="Cannot edit paid orders")
    
    items = data.get("items", [])
    subtotal = sum(item.get("total_price", 0) for item in items)
    service_charge_rate = order.get("service_charge_rate", 10)
    service_charge = subtotal * (service_charge_rate / 100)
    tax_amount = subtotal * 0.1  # 10% tax
    total_amount = subtotal + service_charge + tax_amount
    
    await db.restaurant_orders.update_one(
        {"id": order_id},
        {"$set": {
            "items": items,
            "subtotal": subtotal,
            "service_charge": service_charge,
            "tax_amount": tax_amount,
            "total_amount": total_amount
        }}
    )
    
    updated = await db.restaurant_orders.find_one({"id": order_id}, {"_id": 0})
    return updated

@api_router.post("/restaurant/orders/{order_id}/cancel")
async def cancel_restaurant_order(
    order_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Cancel a restaurant order"""
    order = await db.restaurant_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("payment_status") == "Paid":
        raise HTTPException(status_code=400, detail="Cannot cancel a paid order")
    if order.get("payment_status") == "Room Bill":
        raise HTTPException(status_code=400, detail="Cannot cancel orders sent to Room Bill")
    
    await db.restaurant_orders.update_one(
        {"id": order_id},
        {"$set": {"order_status": "Cancelled", "payment_status": "Cancelled"}}
    )
    return {"message": "Order cancelled successfully"}

@api_router.get("/restaurant/orders/room/{room_number}")
async def get_room_orders(room_number: str):
    """Get all restaurant orders for a specific room (for checkout bill)"""
    orders = await db.restaurant_orders.find({
        "room_number": room_number,
        "payment_status": "Room Bill"
    }, {"_id": 0}).sort("created_at", -1).to_list(100)
    return orders

# ==================== RESTAURANT EXPENSES ====================

@api_router.get("/restaurant/expenses")
async def get_restaurant_expenses():
    """Get all restaurant expenses"""
    expenses = await db.restaurant_expenses.find({}, {"_id": 0}).sort("expense_date", -1).to_list(500)
    # Convert dates
    for exp in expenses:
        if isinstance(exp.get("expense_date"), datetime):
            exp["expense_date"] = exp["expense_date"].strftime("%Y-%m-%d")
    return expenses

@api_router.post("/restaurant/expenses")
async def create_restaurant_expense(
    item_name: str,
    category: str,
    quantity: int = 1,
    unit_price: float = 0,
    total_price: float = 0,
    vendor: str = "",
    expense_date: str = None,
    description: str = "",
    current_user: UserResponse = Depends(get_current_user)
):
    """Add a restaurant expense"""
    expense_id = str(uuid.uuid4())
    exp_date = datetime.strptime(expense_date, "%Y-%m-%d") if expense_date else datetime.utcnow()
    
    expense = {
        "id": expense_id,
        "item_name": item_name,
        "category": category,
        "description": description,
        "quantity": quantity,
        "unit_price": unit_price,
        "total_price": total_price if total_price else quantity * unit_price,
        "vendor": vendor,
        "expense_date": exp_date,
        "created_by": current_user.username,
        "created_at": datetime.utcnow()
    }
    
    await db.restaurant_expenses.insert_one(expense)
    
    # Prepare response before _id is added
    resp_expense = {k: v for k, v in expense.items() if k != '_id'}
    
    # Also add to general expenses
    await db.expenses.insert_one({
        "id": str(uuid.uuid4()),
        "expense_date": exp_date,
        "category": "Restaurant",
        "description": f"{item_name} x{quantity} - {category}",
        "amount": expense["total_price"],
        "payment_method": "Cash",
        "vendor": vendor,
        "created_by": current_user.username,
        "created_at": datetime.utcnow()
    })
    
    return {"message": "Restaurant expense added", "expense": resp_expense}

# ==================== EMAIL & SMS TEMPLATES ====================

@api_router.get("/email-templates")
async def get_email_templates():
    """Get all email templates"""
    templates = await db.email_templates.find({}, {"_id": 0}).to_list(100)
    return templates

@api_router.post("/email-templates")
async def create_email_template(template: EmailTemplateCreate):
    """Create a new email template"""
    template_dict = template.dict()
    template_obj = EmailTemplate(**template_dict)
    await db.email_templates.insert_one(template_obj.dict())
    return {"message": "Email template created", "template": template_obj.dict()}

@api_router.put("/email-templates/{template_id}")
async def update_email_template(template_id: str, template: EmailTemplateCreate):
    """Update an email template"""
    result = await db.email_templates.update_one(
        {"id": template_id},
        {"$set": {**template.dict(), "updated_at": datetime.utcnow()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Email template updated"}

@api_router.delete("/email-templates/{template_id}")
async def delete_email_template(template_id: str):
    """Delete an email template"""
    result = await db.email_templates.delete_one({"id": template_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Email template deleted"}

@api_router.post("/email-templates/init-defaults")
async def init_default_email_templates():
    """Initialize default email templates"""
    default_templates = [
        {
            "name": "Reservation Confirmation",
            "occasion": "reservation",
            "subject": "Booking Confirmation - {hotel_name}",
            "body_html": """
<html>
<body style="font-family: Arial, sans-serif; color: #333;">
<h2>Booking Confirmation</h2>
<p>Dear {guest_name},</p>
<p>Thank you for choosing {hotel_name}. Your reservation has been confirmed.</p>
<div style="background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
    <p><strong>Booking Details:</strong></p>
    <p>Room Number: {room_number}</p>
    <p>Check-in: {check_in_date}</p>
    <p>Check-out: {check_out_date}</p>
    <p>Total Amount: LKR {booking_amount}</p>
</div>
<p>If you have any questions, please contact us at {hotel_phone}.</p>
<p>Best regards,<br>{hotel_name}</p>
</body>
</html>
            """,
            "body_text": "Dear {guest_name}, Your booking at {hotel_name} is confirmed. Room: {room_number}, Check-in: {check_in_date}, Check-out: {check_out_date}",
            "variables": ["guest_name", "hotel_name", "room_number", "check_in_date", "check_out_date", "booking_amount", "hotel_phone"]
        },
        {
            "name": "Check-in Welcome",
            "occasion": "checkin",
            "subject": "Welcome to {hotel_name}!",
            "body_html": """
<html>
<body style="font-family: Arial, sans-serif; color: #333;">
<h2>Welcome!</h2>
<p>Dear {guest_name},</p>
<p>Welcome to {hotel_name}! We're delighted to have you as our guest.</p>
<div style="background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
    <p><strong>Your Stay Details:</strong></p>
    <p>Room Number: {room_number}</p>
    <p>Check-out Date: {check_out_date}</p>
</div>
<p>WiFi Password: {wifi_password}</p>
<p>For any assistance, please dial 0 from your room phone.</p>
<p>Enjoy your stay!</p>
<p>Best regards,<br>{hotel_name}</p>
</body>
</html>
            """,
            "body_text": "Welcome to {hotel_name}, {guest_name}! Your room is {room_number}. Check-out: {check_out_date}. WiFi: {wifi_password}",
            "variables": ["guest_name", "hotel_name", "room_number", "check_out_date", "wifi_password"]
        },
        {
            "name": "Checkout Thank You",
            "occasion": "checkout",
            "subject": "Thank You for Staying at {hotel_name}",
            "body_html": """
<html>
<body style="font-family: Arial, sans-serif; color: #333;">
<h2>Thank You!</h2>
<p>Dear {guest_name},</p>
<p>Thank you for staying with us at {hotel_name}. We hope you had a pleasant experience.</p>
<div style="background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
    <p><strong>Bill Summary:</strong></p>
    <p>Room Charges: LKR {room_charges}</p>
    <p>Additional Charges: LKR {additional_charges}</p>
    <p>Total Paid: LKR {total_amount}</p>
</div>
<p>We look forward to welcoming you again soon!</p>
<p>Best regards,<br>{hotel_name}</p>
</body>
</html>
            """,
            "body_text": "Thank you for staying at {hotel_name}, {guest_name}! Total: LKR {total_amount}. We hope to see you again!",
            "variables": ["guest_name", "hotel_name", "room_charges", "additional_charges", "total_amount"]
        }
    ]
    
    created = 0
    for template_data in default_templates:
        existing = await db.email_templates.find_one({"occasion": template_data["occasion"], "name": template_data["name"]})
        if not existing:
            template = EmailTemplate(**template_data)
            await db.email_templates.insert_one(template.dict())
            created += 1
    
    return {"message": f"Created {created} default email templates"}

# SMS Settings Endpoints
@api_router.get("/sms-settings")
async def get_sms_settings():
    """Get SMS settings"""
    settings = await db.sms_settings.find_one({}, {"_id": 0})
    if not settings:
        return SMSSettings().dict()
    return settings

@api_router.put("/sms-settings")
async def update_sms_settings(settings: SMSSettingsUpdate):
    """Update SMS settings"""
    update_data = {k: v for k, v in settings.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    # Get existing settings to merge with updates
    existing = await db.sms_settings.find_one()
    merged_settings = {**existing, **update_data} if existing else update_data
    
    # Validate configuration based on provider
    provider = merged_settings.get("provider", "notify_lk")
    is_configured = False
    
    if provider == "notify_lk":
        is_configured = all([
            merged_settings.get("notify_lk_user_id"),
            merged_settings.get("notify_lk_api_key"),
            merged_settings.get("notify_lk_sender_id")
        ])
    elif provider == "twilio":
        is_configured = all([
            merged_settings.get("twilio_account_sid"),
            merged_settings.get("twilio_auth_token"),
            merged_settings.get("twilio_phone_number")
        ])
    elif provider == "custom":
        is_configured = all([
            merged_settings.get("custom_api_url"),
            merged_settings.get("custom_api_key")
        ])
    
    update_data["is_configured"] = is_configured
    
    if existing:
        await db.sms_settings.update_one({}, {"$set": update_data})
    else:
        new_settings = SMSSettings(**update_data)
        await db.sms_settings.insert_one(new_settings.dict())
    
    return {"message": "SMS settings updated", "is_configured": is_configured}

@api_router.post("/sms-settings/test")
async def test_sms(phone_number: str, message: str = "Test message from Hotel Management System"):
    """Send a test SMS"""
    settings = await db.sms_settings.find_one()
    if not settings or not settings.get("is_configured"):
        raise HTTPException(status_code=400, detail="SMS settings not configured")
    
    # Send actual SMS using configured provider
    result = await send_sms(phone_number, message)
    
    if result:
        return {"message": f"Test SMS sent successfully to {phone_number}", "provider": settings.get("provider")}
    else:
        return {"message": f"SMS sending failed. Please check your {settings.get('provider')} credentials.", "provider": settings.get("provider"), "success": False}

# SMS Templates Endpoints
@api_router.get("/sms-templates")
async def get_sms_templates():
    """Get all SMS templates"""
    templates = await db.sms_templates.find({}, {"_id": 0}).to_list(100)
    return templates

@api_router.post("/sms-templates")
async def create_sms_template(template: SMSTemplateCreate):
    """Create a new SMS template"""
    template_obj = SMSTemplate(**template.dict())
    await db.sms_templates.insert_one(template_obj.dict())
    return {"message": "SMS template created", "template": template_obj.dict()}

@api_router.put("/sms-templates/{template_id}")
async def update_sms_template(template_id: str, template: SMSTemplateCreate):
    """Update an SMS template"""
    result = await db.sms_templates.update_one(
        {"id": template_id},
        {"$set": {**template.dict(), "updated_at": datetime.utcnow()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "SMS template updated"}

@api_router.delete("/sms-templates/{template_id}")
async def delete_sms_template(template_id: str):
    """Delete an SMS template"""
    result = await db.sms_templates.delete_one({"id": template_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "SMS template deleted"}

@api_router.post("/sms-templates/init-defaults")
async def init_default_sms_templates():
    """Initialize default SMS templates"""
    default_templates = [
        {
            "name": "Reservation Confirmation",
            "occasion": "reservation",
            "body": "Hi {guest_name}, Your booking at {hotel_name} is confirmed. Room: {room_number}, Check-in: {check_in_date}. Contact: {hotel_phone}",
            "variables": ["guest_name", "hotel_name", "room_number", "check_in_date", "hotel_phone"]
        },
        {
            "name": "Check-in Welcome",
            "occasion": "checkin",
            "body": "Welcome to {hotel_name}, {guest_name}! Room: {room_number}. WiFi: {wifi_password}. For help, dial 0.",
            "variables": ["guest_name", "hotel_name", "room_number", "wifi_password"]
        },
        {
            "name": "Checkout Thank You",
            "occasion": "checkout",
            "body": "Thank you for staying at {hotel_name}, {guest_name}! Total: LKR {total_amount}. Visit us again!",
            "variables": ["guest_name", "hotel_name", "total_amount"]
        },
        {
            "name": "Cleaning Assignment",
            "occasion": "cleaning_assigned",
            "body": "Hi {staff_name}, Room {room_number} needs cleaning. Previous guest: {guest_name}. Please clean ASAP.",
            "variables": ["staff_name", "room_number", "guest_name"]
        }
    ]
    
    created = 0
    for template_data in default_templates:
        existing = await db.sms_templates.find_one({"occasion": template_data["occasion"], "name": template_data["name"]})
        if not existing:
            template = SMSTemplate(**template_data)
            await db.sms_templates.insert_one(template.dict())
            created += 1
    
    return {"message": f"Created {created} default SMS templates"}


# ==================== PAYMENT GATEWAY SETTINGS ENDPOINTS ====================

@api_router.get("/payment-settings")
async def get_payment_settings(current_user: UserResponse = Depends(get_current_active_admin)):
    """Get payment gateway settings"""
    settings = await db.payment_settings.find_one({}, {"_id": 0})
    if not settings:
        return PaymentSettings().dict()
    return settings

@api_router.put("/payment-settings")
async def update_payment_settings(settings: PaymentSettingsUpdate, current_user: UserResponse = Depends(get_current_active_admin)):
    """Update payment gateway settings — also updates website backend dynamically"""
    update_data = {k: v for k, v in settings.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    existing = await db.payment_settings.find_one()
    if existing:
        await db.payment_settings.update_one({}, {"$set": update_data})
    else:
        new_settings = PaymentSettings(**update_data)
        await db.payment_settings.insert_one(new_settings.dict())
    
    await log_activity(
        action="payment_settings_updated",
        description=f"Payment settings updated by {current_user.username}",
        user_name=current_user.username,
        entity_type="settings"
    )
    
    return {"message": "Payment settings updated successfully"}


# ==================== CHANNEL API SETTINGS ENDPOINTS ====================

@api_router.get("/channel-api-settings")
async def get_channel_api_settings(current_user: UserResponse = Depends(get_current_user)):
    """Get channel API settings for OTA integrations"""
    settings = await db.channel_api_settings.find_one({}, {"_id": 0})
    if not settings:
        # Return default empty settings
        return ChannelApiSettings().dict()
    return settings

@api_router.put("/channel-api-settings")
async def update_channel_api_settings(
    settings: ChannelApiSettingsUpdate,
    current_user: UserResponse = Depends(get_current_user)
):
    """Update channel API settings"""
    existing = await db.channel_api_settings.find_one()
    
    update_data = {k: v for k, v in settings.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    if existing:
        await db.channel_api_settings.update_one({}, {"$set": update_data})
    else:
        new_settings = ChannelApiSettings(**update_data)
        await db.channel_api_settings.insert_one(new_settings.dict())
    
    # Log the activity
    await db.activity_logs.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": current_user.id,
        "username": current_user.username,
        "action": "channel_api_settings_updated",
        "entity_type": "settings",
        "details": "Channel API integration settings updated",
        "timestamp": datetime.utcnow()
    })
    
    return {"message": "Channel API settings updated successfully"}

# ==================== CUSTOM MESSAGING ENDPOINTS ====================

class CustomSMSRequest(BaseModel):
    phone_number: str
    message: str
    guest_id: Optional[str] = None

class CustomEmailRequest(BaseModel):
    email: str
    subject: str
    body: str
    guest_id: Optional[str] = None

@api_router.post("/send-custom-sms")
async def send_custom_sms_message(request: CustomSMSRequest, current_user: UserResponse = Depends(get_current_user)):
    """Send a custom SMS message to any phone number"""
    settings = await db.sms_settings.find_one()
    if not settings or not settings.get("is_configured"):
        raise HTTPException(status_code=400, detail="SMS settings not configured. Please configure SMS gateway in Settings.")
    
    result = await send_sms(request.phone_number, request.message)
    
    # Log the message
    message_log = {
        "id": str(uuid.uuid4()),
        "type": "sms",
        "recipient": request.phone_number,
        "content": request.message,
        "guest_id": request.guest_id,
        "sent_by": current_user.username,
        "status": "sent" if result else "failed",
        "sent_at": datetime.now()
    }
    await db.message_logs.insert_one(message_log)
    
    if result:
        return {"message": f"SMS sent successfully to {request.phone_number}", "success": True}
    else:
        raise HTTPException(status_code=500, detail="Failed to send SMS. Please check your gateway credentials.")

@api_router.post("/send-custom-email")
async def send_custom_email_message(request: CustomEmailRequest, current_user: UserResponse = Depends(get_current_user)):
    """Send a custom email to any email address"""
    email_settings = await get_email_settings()
    if not email_settings or not email_settings.is_configured:
        raise HTTPException(status_code=400, detail="Email settings not configured. Please configure email provider in Settings.")
    
    result = await send_email(request.email, request.subject, request.body)
    
    # Log the message
    message_log = {
        "id": str(uuid.uuid4()),
        "type": "email",
        "recipient": request.email,
        "subject": request.subject,
        "content": request.body,
        "guest_id": request.guest_id,
        "sent_by": current_user.username,
        "status": "sent" if result else "failed",
        "sent_at": datetime.now()
    }
    await db.message_logs.insert_one(message_log)
    
    if result:
        return {"message": f"Email sent successfully to {request.email}", "success": True}
    else:
        raise HTTPException(status_code=500, detail="Failed to send email. Please check your email provider credentials.")

@api_router.get("/message-logs")
async def get_message_logs(
    message_type: Optional[str] = None,
    guest_id: Optional[str] = None,
    limit: int = 50
):
    """Get message sending logs"""
    query = {}
    if message_type:
        query["type"] = message_type
    if guest_id:
        query["guest_id"] = guest_id
    
    logs = await db.message_logs.find(query, {"_id": 0}).sort("sent_at", -1).limit(limit).to_list(limit)
    return logs

# ==================== MAINTENANCE TRACKING ====================

@api_router.get("/maintenance/items")
async def get_maintenance_items(
    room_number: Optional[str] = None,
    category: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """Get maintenance items with optional filters"""
    query = {}
    if room_number:
        query["room_number"] = room_number
    if category:
        query["category"] = category
    if start_date and end_date:
        query["purchase_date"] = {
            "$gte": datetime.strptime(start_date, "%Y-%m-%d"),
            "$lte": datetime.strptime(end_date, "%Y-%m-%d")
        }
    
    items = await db.maintenance_items.find(query, {"_id": 0}).sort("purchase_date", -1).to_list(500)
    
    # Convert dates for response
    for item in items:
        if isinstance(item.get("purchase_date"), datetime):
            item["purchase_date"] = item["purchase_date"].strftime("%Y-%m-%d")
    
    return items

@api_router.post("/maintenance/items")
async def create_maintenance_item(item: MaintenanceItemCreate, current_user: UserResponse = Depends(get_current_user)):
    """Create a maintenance item/expense"""
    item_dict = item.dict()
    item_dict["total_price"] = item_dict["quantity"] * item_dict["unit_price"]
    item_dict["created_by"] = current_user.username
    
    # Convert date to datetime for MongoDB
    if isinstance(item_dict.get("purchase_date"), date):
        item_dict["purchase_date"] = datetime.combine(item_dict["purchase_date"], datetime.min.time())
    
    item_obj = MaintenanceItem(**item_dict)
    await db.maintenance_items.insert_one(item_obj.dict())
    
    # Also record as expense
    expense_data = {
        "id": str(uuid.uuid4()),
        "expense_date": item_dict["purchase_date"],
        "category": f"Maintenance - {item.category}",
        "description": f"{item.item_name} x{item.quantity} - {item.description}" if item.description else f"{item.item_name} x{item.quantity}",
        "amount": item_dict["total_price"],
        "payment_method": "Cash",
        "vendor": item.vendor,
        "created_by": current_user.username,
        "created_at": datetime.utcnow()
    }
    await db.expenses.insert_one(expense_data)
    
    return {"message": "Maintenance item added", "item": item_obj.dict()}

@api_router.delete("/maintenance/items/{item_id}")
async def delete_maintenance_item(item_id: str):
    """Delete a maintenance item"""
    result = await db.maintenance_items.delete_one({"id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Maintenance item deleted"}

@api_router.get("/maintenance/tasks")
async def get_maintenance_tasks(
    room_number: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None
):
    """Get maintenance tasks with optional filters"""
    query = {}
    if room_number:
        query["room_number"] = room_number
    if status:
        query["status"] = status
    if priority:
        query["priority"] = priority
    
    tasks = await db.maintenance_tasks.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    # Convert dates
    for task in tasks:
        for field in ["scheduled_date", "completed_date"]:
            if isinstance(task.get(field), datetime):
                task[field] = task[field].strftime("%Y-%m-%d")
    
    return tasks

@api_router.post("/maintenance/tasks")
async def create_maintenance_task(task: MaintenanceTaskCreate, current_user: UserResponse = Depends(get_current_user)):
    """Create a maintenance task"""
    task_dict = task.dict()
    task_dict["created_by"] = current_user.username
    
    # Convert date to datetime for MongoDB
    if isinstance(task_dict.get("scheduled_date"), date):
        task_dict["scheduled_date"] = datetime.combine(task_dict["scheduled_date"], datetime.min.time())
    
    task_obj = MaintenanceTask(**task_dict)
    await db.maintenance_tasks.insert_one(task_obj.dict())
    
    return {"message": "Maintenance task created", "task": task_obj.dict()}

@api_router.put("/maintenance/tasks/{task_id}")
async def update_maintenance_task(task_id: str, updates: dict):
    """Update a maintenance task"""
    updates["updated_at"] = datetime.utcnow()
    
    # Handle date conversions
    if "scheduled_date" in updates and updates["scheduled_date"]:
        updates["scheduled_date"] = datetime.strptime(updates["scheduled_date"], "%Y-%m-%d")
    if "completed_date" in updates and updates["completed_date"]:
        updates["completed_date"] = datetime.strptime(updates["completed_date"], "%Y-%m-%d")
    
    result = await db.maintenance_tasks.update_one(
        {"id": task_id},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Maintenance task updated"}

@api_router.delete("/maintenance/tasks/{task_id}")
async def delete_maintenance_task(task_id: str):
    """Delete a maintenance task"""
    result = await db.maintenance_tasks.delete_one({"id": task_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Maintenance task deleted"}

@api_router.get("/maintenance/summary")
async def get_maintenance_summary():
    """Get maintenance summary stats"""
    # Get total expenses by category
    items = await db.maintenance_items.find({}, {"_id": 0}).to_list(1000)
    
    total_expense = sum(item.get("total_price", 0) for item in items)
    
    # Group by category
    by_category = {}
    for item in items:
        cat = item.get("category", "General")
        by_category[cat] = by_category.get(cat, 0) + item.get("total_price", 0)
    
    # Get task stats
    tasks = await db.maintenance_tasks.find({}, {"_id": 0}).to_list(500)
    pending_tasks = len([t for t in tasks if t.get("status") == "Pending"])
    in_progress = len([t for t in tasks if t.get("status") == "In Progress"])
    completed_tasks = len([t for t in tasks if t.get("status") == "Completed"])
    
    return {
        "total_expense": total_expense,
        "by_category": by_category,
        "tasks": {
            "pending": pending_tasks,
            "in_progress": in_progress,
            "completed": completed_tasks,
            "total": len(tasks)
        }
    }

# ==================== STOCK/INVENTORY MANAGEMENT ====================

@api_router.get("/stocks")
async def get_stocks(item_type: Optional[str] = None, category: Optional[str] = None):
    """Get all stock items with optional filters"""
    query = {"is_active": True}
    if item_type:
        query["item_type"] = item_type
    if category:
        query["category"] = category
    
    stocks = await db.stocks.find(query, {"_id": 0}).sort("item_name", 1).to_list(500)
    return stocks

@api_router.post("/stocks")
async def create_stock_item(stock: StockItemCreate, current_user: UserResponse = Depends(get_current_user)):
    """Create a new stock item"""
    stock_dict = stock.dict()
    stock_obj = StockItem(**stock_dict)
    await db.stocks.insert_one(stock_obj.dict())
    
    # Record initial stock transaction if any
    if stock_dict.get("current_stock", 0) > 0:
        transaction = StockTransaction(
            stock_item_id=stock_obj.id,
            stock_item_name=stock_obj.item_name,
            transaction_type="add",
            quantity=stock_dict["current_stock"],
            previous_stock=0,
            new_stock=stock_dict["current_stock"],
            notes="Initial stock",
            created_by=current_user.username
        )
        await db.stock_transactions.insert_one(transaction.dict())
    
    return {"message": "Stock item created", "stock": stock_obj.dict()}

@api_router.put("/stocks/{stock_id}")
async def update_stock_item(stock_id: str, updates: dict, current_user: UserResponse = Depends(get_current_user)):
    """Update stock item details (not quantity - use adjust endpoint for that)"""
    updates["updated_at"] = datetime.utcnow()
    
    # Don't allow direct quantity updates through this endpoint
    if "current_stock" in updates:
        del updates["current_stock"]
    
    result = await db.stocks.update_one(
        {"id": stock_id},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Stock item not found")
    return {"message": "Stock item updated"}

@api_router.post("/stocks/{stock_id}/adjust")
async def adjust_stock(stock_id: str, adjustment: StockAdjustment, current_user: UserResponse = Depends(get_current_user)):
    """Add or remove stock quantity"""
    stock = await db.stocks.find_one({"id": stock_id})
    if not stock:
        raise HTTPException(status_code=404, detail="Stock item not found")
    
    previous_stock = stock.get("current_stock", 0)
    
    if adjustment.transaction_type == "add":
        new_stock = previous_stock + adjustment.quantity
    elif adjustment.transaction_type == "remove":
        new_stock = previous_stock - adjustment.quantity
        if new_stock < 0:
            raise HTTPException(status_code=400, detail="Cannot reduce stock below 0")
    else:  # adjustment
        new_stock = adjustment.quantity
    
    # Update stock
    await db.stocks.update_one(
        {"id": stock_id},
        {"$set": {"current_stock": new_stock, "updated_at": datetime.utcnow()}}
    )
    
    # Record transaction
    transaction = StockTransaction(
        stock_item_id=stock_id,
        stock_item_name=stock.get("item_name", ""),
        transaction_type=adjustment.transaction_type,
        quantity=adjustment.quantity,
        previous_stock=previous_stock,
        new_stock=new_stock,
        notes=adjustment.notes,
        created_by=current_user.username
    )
    await db.stock_transactions.insert_one(transaction.dict())
    
    return {
        "message": f"Stock {adjustment.transaction_type}ed successfully",
        "previous_stock": previous_stock,
        "new_stock": new_stock
    }

@api_router.delete("/stocks/{stock_id}")
async def delete_stock_item(stock_id: str):
    """Soft delete a stock item (mark as inactive)"""
    result = await db.stocks.update_one(
        {"id": stock_id},
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Stock item not found")
    return {"message": "Stock item deleted"}

@api_router.get("/stocks/transactions")
async def get_stock_transactions(stock_item_id: Optional[str] = None, limit: int = 100):
    """Get stock transaction history"""
    query = {}
    if stock_item_id:
        query["stock_item_id"] = stock_item_id
    
    transactions = await db.stock_transactions.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return transactions

@api_router.get("/stocks/low-stock")
async def get_low_stock_items():
    """Get items that are below their low stock threshold"""
    pipeline = [
        {"$match": {"is_active": True}},
        {"$match": {"$expr": {"$lte": ["$current_stock", "$low_stock_threshold"]}}},
        {"$project": {"_id": 0}}
    ]
    low_stock_items = await db.stocks.aggregate(pipeline).to_list(100)
    return low_stock_items

@api_router.get("/stocks/summary")
async def get_stocks_summary():
    """Get stock summary statistics"""
    all_stocks = await db.stocks.find({"is_active": True}, {"_id": 0}).to_list(500)
    
    restaurant_stocks = [s for s in all_stocks if s.get("item_type") == "restaurant"]
    maintenance_stocks = [s for s in all_stocks if s.get("item_type") == "maintenance"]
    
    # Calculate low stock items
    low_stock = [s for s in all_stocks if s.get("current_stock", 0) <= s.get("low_stock_threshold", 10)]
    
    # Calculate total value
    total_value = sum(s.get("current_stock", 0) * s.get("cost_per_unit", 0) for s in all_stocks)
    
    return {
        "total_items": len(all_stocks),
        "restaurant_items": len(restaurant_stocks),
        "maintenance_items": len(maintenance_stocks),
        "low_stock_count": len(low_stock),
        "total_stock_value": total_value
    }

# Helper function to deduct stock when restaurant order is placed
async def deduct_stock_for_order(order_items: list, order_id: str, username: str):
    """Deduct stock for menu items that have stock tracking enabled"""
    for item in order_items:
        menu_item = await db.menu_items.find_one({"id": item.get("item_id")})
        if menu_item and menu_item.get("track_stock") and menu_item.get("stock_item_id"):
            stock = await db.stocks.find_one({"id": menu_item["stock_item_id"]})
            if stock:
                quantity_to_deduct = item.get("quantity", 1)
                previous_stock = stock.get("current_stock", 0)
                new_stock = max(0, previous_stock - quantity_to_deduct)
                
                # Update stock
                await db.stocks.update_one(
                    {"id": stock["id"]},
                    {"$set": {"current_stock": new_stock, "updated_at": datetime.utcnow()}}
                )
                
                # Record transaction
                transaction = StockTransaction(
                    stock_item_id=stock["id"],
                    stock_item_name=stock.get("item_name", ""),
                    transaction_type="sale",
                    quantity=quantity_to_deduct,
                    previous_stock=previous_stock,
                    new_stock=new_stock,
                    notes=f"Sold: {item.get('name', '')} x{quantity_to_deduct}",
                    reference_id=order_id,
                    created_by=username
                )
                await db.stock_transactions.insert_one(transaction.dict())

# ==================== PAYROLL SYSTEM ====================

@api_router.get("/payroll/employees")
async def get_employees(status: Optional[str] = None, department: Optional[str] = None):
    """Get all employees"""
    query = {}
    if status:
        query["status"] = status
    if department:
        query["department"] = department
    
    employees = await db.employees.find(query, {"_id": 0}).to_list(500)
    
    # Convert dates
    for emp in employees:
        for field in ["date_of_birth", "hire_date"]:
            if isinstance(emp.get(field), datetime):
                emp[field] = emp[field].strftime("%Y-%m-%d")
    
    return employees

@api_router.post("/payroll/employees")
async def create_employee(employee: EmployeeCreate):
    """Create a new employee"""
    # Check if employee ID already exists
    existing = await db.employees.find_one({"employee_id": employee.employee_id})
    if existing:
        raise HTTPException(status_code=400, detail="Employee ID already exists")
    
    emp_dict = employee.dict()
    
    # Convert dates to datetime for MongoDB
    for field in ["date_of_birth", "hire_date"]:
        if isinstance(emp_dict.get(field), date):
            emp_dict[field] = datetime.combine(emp_dict[field], datetime.min.time())
    
    emp_obj = Employee(**emp_dict)
    storage = emp_obj.dict()
    # Ensure all date fields are datetime for MongoDB
    for field in ["date_of_birth", "hire_date"]:
        if isinstance(storage.get(field), date) and not isinstance(storage.get(field), datetime):
            storage[field] = datetime.combine(storage[field], datetime.min.time())
    
    await db.employees.insert_one(storage)
    storage.pop("_id", None)
    
    return {"message": "Employee created", "employee": storage}

@api_router.put("/payroll/employees/{employee_id}")
async def update_employee(employee_id: str, updates: dict):
    """Update an employee"""
    updates["updated_at"] = datetime.utcnow()
    
    # Handle date conversions
    for field in ["date_of_birth", "hire_date"]:
        if field in updates and updates[field]:
            if isinstance(updates[field], str):
                updates[field] = datetime.strptime(updates[field], "%Y-%m-%d")
    
    result = await db.employees.update_one(
        {"id": employee_id},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Employee not found")
    return {"message": "Employee updated"}

@api_router.delete("/payroll/employees/{employee_id}")
async def delete_employee(employee_id: str):
    """Delete an employee (or mark as inactive)"""
    result = await db.employees.update_one(
        {"id": employee_id},
        {"$set": {"status": "Terminated", "updated_at": datetime.utcnow()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Employee not found")
    return {"message": "Employee terminated"}

# Salary Components
@api_router.get("/payroll/salary-components")
async def get_salary_components():
    """Get all salary components (allowances/deductions)"""
    components = await db.salary_components.find({"is_active": True}, {"_id": 0}).to_list(100)
    return components

@api_router.post("/payroll/salary-components")
async def create_salary_component(component: SalaryComponentCreate):
    """Create a new salary component"""
    comp_obj = SalaryComponent(**component.dict())
    await db.salary_components.insert_one(comp_obj.dict())
    return {"message": "Salary component created", "component": comp_obj.dict()}

@api_router.delete("/payroll/salary-components/{component_id}")
async def delete_salary_component(component_id: str):
    """Delete a salary component"""
    result = await db.salary_components.update_one(
        {"id": component_id},
        {"$set": {"is_active": False}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Component not found")
    return {"message": "Salary component deleted"}

# Loans
@api_router.get("/payroll/loans")
async def get_loans(employee_id: Optional[str] = None, status: Optional[str] = None):
    """Get loans"""
    query = {}
    if employee_id:
        query["employee_id"] = employee_id
    if status:
        query["status"] = status
    
    loans = await db.loans.find(query, {"_id": 0}).to_list(500)
    
    # Convert dates
    for loan in loans:
        for field in ["disbursement_date", "repayment_start_date"]:
            if isinstance(loan.get(field), datetime):
                loan[field] = loan[field].strftime("%Y-%m-%d")
    
    return loans

@api_router.post("/payroll/loans")
async def create_loan(loan: LoanCreate, current_user: UserResponse = Depends(get_current_user)):
    """Create a new loan"""
    loan_dict = loan.dict()
    loan_dict["remaining_balance"] = loan.amount
    loan_dict["approved_by"] = current_user.username
    
    # Convert dates to datetime for MongoDB
    for field in ["disbursement_date", "repayment_start_date"]:
        if isinstance(loan_dict.get(field), date):
            loan_dict[field] = datetime.combine(loan_dict[field], datetime.min.time())
    
    loan_obj = Loan(**loan_dict)
    await db.loans.insert_one(loan_obj.dict())
    
    return {"message": "Loan created", "loan": loan_obj.dict()}

@api_router.put("/payroll/loans/{loan_id}/payment")
async def record_loan_payment(loan_id: str, amount: float):
    """Record a loan payment"""
    loan = await db.loans.find_one({"id": loan_id})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    new_balance = loan["remaining_balance"] - amount
    new_paid = loan["paid_installments"] + 1
    
    update_data = {
        "remaining_balance": max(0, new_balance),
        "paid_installments": new_paid,
        "updated_at": datetime.utcnow()
    }
    
    if new_balance <= 0:
        update_data["status"] = "Completed"
    
    await db.loans.update_one({"id": loan_id}, {"$set": update_data})
    
    return {"message": "Loan payment recorded", "remaining_balance": max(0, new_balance)}

# Payroll Processing
@api_router.post("/payroll/process")
async def process_payroll(
    pay_period_start: str,
    pay_period_end: str,
    payment_date: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Process payroll for a period using PayrollSettings from database"""
    # Get payroll settings from database
    payroll_settings = await db.payroll_settings.find_one({}, {"_id": 0})
    if not payroll_settings:
        # Use defaults if not configured
        payroll_settings = {
            "enable_epf": True,
            "epf_employee_rate": 8.0,
            "epf_employer_rate": 12.0,
            "enable_etf": True,
            "etf_rate": 3.0,
            "tax_enabled": False,
            "tax_rate": 0.0
        }
    
    # Get all active employees
    employees = await db.employees.find({"status": "Active"}, {"_id": 0}).to_list(500)
    
    if not employees:
        raise HTTPException(status_code=400, detail="No active employees found")
    
    # Get salary components
    components = await db.salary_components.find({"is_active": True}, {"_id": 0}).to_list(100)
    allowances = [c for c in components if c.get("type") == "allowance"]
    deductions = [c for c in components if c.get("type") == "deduction"]
    
    # Get active loans
    loans = await db.loans.find({"status": "Active"}, {"_id": 0}).to_list(500)
    loan_by_employee = {}
    for loan in loans:
        emp_id = loan["employee_id"]
        if emp_id not in loan_by_employee:
            loan_by_employee[emp_id] = []
        loan_by_employee[emp_id].append(loan)
    
    # Create payroll run
    payroll_run = PayrollRun(
        pay_period_start=datetime.strptime(pay_period_start, "%Y-%m-%d").date(),
        pay_period_end=datetime.strptime(pay_period_end, "%Y-%m-%d").date(),
        payment_date=datetime.strptime(payment_date, "%Y-%m-%d").date(),
        status="Processing",
        processed_by=current_user.username
    )
    
    total_gross = 0
    total_deductions = 0
    total_net = 0
    total_epf_employee = 0
    total_epf_employer = 0
    total_etf = 0
    total_tax = 0
    
    payslips = []
    
    for emp in employees:
        basic_salary = emp.get("basic_salary", 0)
        
        # Calculate allowances
        emp_allowances = []
        total_allowances = 0
        for allowance in allowances:
            if allowance.get("applies_to_all"):
                if allowance.get("amount_type") == "percentage":
                    amt = basic_salary * (allowance.get("amount", 0) / 100)
                else:
                    amt = allowance.get("amount", 0)
                emp_allowances.append({"name": allowance["name"], "amount": amt})
                total_allowances += amt
        
        gross_salary = basic_salary + total_allowances
        
        # Calculate deductions from salary components
        emp_deductions = []
        total_emp_deductions = 0
        for deduction in deductions:
            if deduction.get("applies_to_all"):
                if deduction.get("amount_type") == "percentage":
                    base = gross_salary if deduction.get("percentage_of") == "gross_salary" else basic_salary
                    amt = base * (deduction.get("amount", 0) / 100)
                else:
                    amt = deduction.get("amount", 0)
                emp_deductions.append({"name": deduction["name"], "amount": amt})
                total_emp_deductions += amt
        
        # EPF calculations using PayrollSettings (Sri Lanka specific)
        epf_employee = 0
        epf_employer = 0
        if payroll_settings.get("enable_epf", True):
            epf_employee_rate = payroll_settings.get("epf_employee_rate", 8.0) / 100
            epf_employer_rate = payroll_settings.get("epf_employer_rate", 12.0) / 100
            epf_employee = gross_salary * epf_employee_rate
            epf_employer = gross_salary * epf_employer_rate
            emp_deductions.append({"name": "EPF (Employee)", "amount": epf_employee})
        
        # ETF calculations using PayrollSettings
        etf_employer = 0
        if payroll_settings.get("enable_etf", True):
            etf_rate = payroll_settings.get("etf_rate", 3.0) / 100
            etf_employer = gross_salary * etf_rate
        
        # Tax calculations using PayrollSettings
        tax_amount = 0
        if payroll_settings.get("tax_enabled", False):
            tax_rate = payroll_settings.get("tax_rate", 0) / 100
            tax_amount = gross_salary * tax_rate
            emp_deductions.append({"name": "Income Tax", "amount": tax_amount})
        
        # Loan deductions
        loan_deduction = 0
        emp_loans = loan_by_employee.get(emp["id"], [])
        for loan in emp_loans:
            loan_deduction += loan.get("installment_amount", 0)
            # Update loan paid installments
            await db.loans.update_one(
                {"id": loan["id"]},
                {"$inc": {"paid_installments": 1}, "$set": {"remaining_balance": max(0, loan["remaining_balance"] - loan.get("installment_amount", 0))}}
            )
        
        if loan_deduction > 0:
            emp_deductions.append({"name": "Loan Repayment", "amount": loan_deduction})
        
        # Total deductions (EPF already added to emp_deductions, so just sum)
        all_deductions = sum([d["amount"] for d in emp_deductions])
        
        # Net salary
        net_salary = gross_salary - all_deductions
        
        # Create payslip
        payslip = PaySlip(
            payroll_run_id=payroll_run.id,
            employee_id=emp["id"],
            employee_name=f"{emp.get('first_name', '')} {emp.get('last_name', '')}",
            pay_period_start=payroll_run.pay_period_start,
            pay_period_end=payroll_run.pay_period_end,
            payment_date=payroll_run.payment_date,
            basic_salary=basic_salary,
            allowances=emp_allowances,
            gross_salary=gross_salary,
            deductions=emp_deductions,
            loan_deduction=loan_deduction,
            epf_employee=epf_employee,
            total_deductions=all_deductions,
            net_salary=net_salary,
            epf_employer=epf_employer,
            etf_employer=etf_employer,
            bank_details=f"{emp.get('bank_name', '')} - {emp.get('bank_account', '')}"
        )
        
        # Convert dates to datetime for MongoDB
        payslip_dict = payslip.dict()
        payslip_dict["tax_amount"] = tax_amount
        for field in ["pay_period_start", "pay_period_end", "payment_date"]:
            if isinstance(payslip_dict.get(field), date):
                payslip_dict[field] = datetime.combine(payslip_dict[field], datetime.min.time())
        
        await db.payslips.insert_one(payslip_dict)
        payslips.append(payslip_dict)
        
        # Update totals
        total_gross += gross_salary
        total_deductions += all_deductions
        total_net += net_salary
        total_epf_employee += epf_employee
        total_epf_employer += epf_employer
        total_etf += etf_employer
        total_tax += tax_amount
    
    # Update payroll run with totals
    payroll_run_dict = payroll_run.dict()
    payroll_run_dict.update({
        "total_gross": total_gross,
        "total_deductions": total_deductions,
        "total_net": total_net,
        "total_epf_employee": total_epf_employee,
        "total_epf_employer": total_epf_employer,
        "total_etf": total_etf,
        "status": "Completed"
    })
    
    # Convert dates to datetime for MongoDB
    for field in ["pay_period_start", "pay_period_end", "payment_date"]:
        if isinstance(payroll_run_dict.get(field), date):
            payroll_run_dict[field] = datetime.combine(payroll_run_dict[field], datetime.min.time())
    
    await db.payroll_runs.insert_one(payroll_run_dict)
    
    return {
        "message": f"Payroll processed for {len(employees)} employees",
        "payroll_run_id": payroll_run.id,
        "totals": {
            "gross": total_gross,
            "deductions": total_deductions,
            "net": total_net,
            "epf_employee": total_epf_employee,
            "epf_employer": total_epf_employer,
            "etf": total_etf
        }
    }

@api_router.get("/payroll/runs")
async def get_payroll_runs():
    """Get all payroll runs"""
    runs = await db.payroll_runs.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Convert dates
    for run in runs:
        for field in ["pay_period_start", "pay_period_end", "payment_date"]:
            if isinstance(run.get(field), datetime):
                run[field] = run[field].strftime("%Y-%m-%d")
    
    return runs

@api_router.get("/payroll/payslips")
async def get_payslips(payroll_run_id: Optional[str] = None, employee_id: Optional[str] = None):
    """Get payslips"""
    query = {}
    if payroll_run_id:
        query["payroll_run_id"] = payroll_run_id
    if employee_id:
        query["employee_id"] = employee_id
    
    payslips = await db.payslips.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    # Convert dates
    for slip in payslips:
        for field in ["pay_period_start", "pay_period_end", "payment_date"]:
            if isinstance(slip.get(field), datetime):
                slip[field] = slip[field].strftime("%Y-%m-%d")
    
    return payslips

@api_router.get("/payroll/summary")
async def get_payroll_summary():
    """Get payroll summary statistics"""
    employees = await db.employees.find({"status": "Active"}, {"_id": 0}).to_list(500)
    
    total_monthly_salary = sum(emp.get("basic_salary", 0) for emp in employees)
    
    # Get department breakdown
    by_department = {}
    for emp in employees:
        dept = emp.get("department", "Other")
        if dept not in by_department:
            by_department[dept] = {"count": 0, "total_salary": 0}
        by_department[dept]["count"] += 1
        by_department[dept]["total_salary"] += emp.get("basic_salary", 0)
    
    # Get active loans
    loans = await db.loans.find({"status": "Active"}, {"_id": 0}).to_list(500)
    total_loan_balance = sum(loan.get("remaining_balance", 0) for loan in loans)
    
    return {
        "total_employees": len(employees),
        "total_monthly_salary": total_monthly_salary,
        "by_department": by_department,
        "active_loans": len(loans),
        "total_loan_balance": total_loan_balance
    }

# Payroll Settings Endpoints
@api_router.get("/payroll/settings")
async def get_payroll_settings(current_user: UserResponse = Depends(get_current_user)):
    """Get payroll settings"""
    settings = await db.payroll_settings.find_one({}, {"_id": 0})
    if not settings:
        # Create default settings if none exist
        default_settings = PayrollSettings()
        await db.payroll_settings.insert_one(default_settings.dict())
        return default_settings.dict()
    return settings

@api_router.put("/payroll/settings")
async def update_payroll_settings(
    settings: PayrollSettingsUpdate,
    current_user: UserResponse = Depends(get_current_active_admin)
):
    """Update payroll settings (Admin only)"""
    # Get existing settings
    existing = await db.payroll_settings.find_one({})
    
    if not existing:
        # Create new settings if none exist
        new_settings = PayrollSettings(**settings.dict(exclude_unset=True))
        new_settings.updated_by = current_user.username
        await db.payroll_settings.insert_one(new_settings.dict())
        
        # Log activity
        await log_activity(
            action="updated_payroll_settings",
            description="Created payroll settings",
            user_name=current_user.full_name or current_user.username
        )
        
        return new_settings.dict()
    else:
        # Update existing settings
        update_data = settings.dict(exclude_unset=True)
        update_data["updated_at"] = datetime.utcnow()
        update_data["updated_by"] = current_user.username
        
        await db.payroll_settings.update_one(
            {"id": existing["id"]},
            {"$set": update_data}
        )
        
        # Log activity
        await log_activity(
            action="updated_payroll_settings",
            description="Updated payroll settings",
            user_name=current_user.full_name or current_user.username
        )
        
        # Return updated settings
        updated_settings = await db.payroll_settings.find_one({}, {"_id": 0})
        return updated_settings

# ==================== TAX CONFIGURATION ====================

@api_router.get("/taxes")
async def get_tax_configs():
    """Get all tax configurations"""
    taxes = await db.tax_configs.find({}, {"_id": 0}).to_list(100)
    return taxes

@api_router.post("/taxes")
async def create_tax_config(
    name: str,
    rate: float,
    type: str = "percentage",
    apply_to_bookings: bool = True,
    apply_to_restaurant: bool = False,
    description: str = ""
):
    """Create a new tax/levy configuration"""
    tax = TaxConfig(
        name=name,
        rate=rate,
        type=type,
        apply_to_bookings=apply_to_bookings,
        apply_to_restaurant=apply_to_restaurant,
        description=description
    )
    await db.tax_configs.insert_one(tax.dict())
    return {"message": "Tax configuration created", "tax": tax.dict()}

@api_router.put("/taxes/{tax_id}")
async def update_tax_config(tax_id: str, updates: dict):
    """Update a tax configuration"""
    updates["updated_at"] = datetime.utcnow()
    result = await db.tax_configs.update_one(
        {"id": tax_id},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tax config not found")
    updated_tax = await db.tax_configs.find_one({"id": tax_id}, {"_id": 0})
    return {"message": "Tax configuration updated", "tax": updated_tax}

@api_router.delete("/taxes/{tax_id}")
async def delete_tax_config(tax_id: str):
    """Delete a tax configuration"""
    result = await db.tax_configs.delete_one({"id": tax_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Tax config not found")
    return {"message": "Tax configuration deleted"}

@api_router.post("/taxes/calculate-booking")
async def api_calculate_booking_taxes(base_amount: float):
    """Calculate booking taxes for a given amount (preview)"""
    result = await calculate_booking_taxes(base_amount)
    return {
        "base_amount": base_amount,
        "total_tax": result["total_tax"],
        "total_with_tax": result["grand_total"],
        "breakdown": result["tax_breakdown"]
    }

@api_router.post("/taxes/calculate-restaurant")
async def api_calculate_restaurant_taxes(base_amount: float):
    """Calculate restaurant taxes for a given amount (preview)"""
    result = await calculate_restaurant_taxes(base_amount)
    return {
        "base_amount": base_amount,
        "total_tax": result["total_tax"],
        "total_with_tax": result["grand_total"],
        "breakdown": result["tax_breakdown"]
    }

# ==================== COMMISSION EXPORT ====================

@api_router.get("/commissions/export")
async def export_commissions(format: str = "csv", start_date: Optional[str] = None, end_date: Optional[str] = None):
    """Export commission data"""
    
    query = {}
    if start_date and end_date:
        query["booking_date"] = {
            "$gte": datetime.strptime(start_date, "%Y-%m-%d"),
            "$lte": datetime.strptime(end_date, "%Y-%m-%d")
        }
    
    # Get bookings with commission data
    bookings = await db.bookings.find(query, {"_id": 0}).sort("booking_date", -1).to_list(1000)
    
    # Get channels
    channels = await db.booking_channels.find({}, {"_id": 0}).to_list(100)
    channel_map = {ch["name"]: ch for ch in channels}
    
    # Calculate commissions
    commission_data = []
    for booking in bookings:
        channel_name = booking.get("booking_channel", "Direct")
        channel = channel_map.get(channel_name, {})
        commission_rate = channel.get("commission_percentage", 0)
        booking_amount = booking.get("booking_amount", 0)
        commission_amount = booking_amount * (commission_rate / 100)
        
        commission_data.append({
            "booking_id": booking.get("id", ""),
            "guest_name": booking.get("guest_name", ""),
            "room_number": booking.get("room_number", ""),
            "booking_date": booking.get("booking_date").strftime("%Y-%m-%d") if isinstance(booking.get("booking_date"), datetime) else str(booking.get("booking_date", "")),
            "check_in_date": str(booking.get("check_in_date", "")),
            "check_out_date": str(booking.get("check_out_date", "")),
            "channel": channel_name,
            "booking_amount": booking_amount,
            "commission_rate": commission_rate,
            "commission_amount": commission_amount,
            "status": booking.get("status", "")
        })
    
    if format == "csv":
        output = io.StringIO()
        if commission_data:
            writer = csv.DictWriter(output, fieldnames=commission_data[0].keys())
            writer.writeheader()
            writer.writerows(commission_data)
        
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=commissions_{datetime.now().strftime('%Y%m%d')}.csv"}
        )
    
    return commission_data

# ==================== GUEST FEEDBACK ====================
def _date_str(v):
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, date):
        return v.isoformat()
    return str(v)[:10] if v else ""

async def send_feedback_request(customer: dict):
    """Create a feedback request for a checked-out guest and send it via email + SMS."""
    try:
        email = (customer.get("email") or "").strip()
        phone = (customer.get("phone") or "").strip()
        if not email and not phone:
            return
        if await db.feedback_requests.find_one({"customer_id": customer["id"]}):
            return
        settings = await db.settings.find_one({}, {"_id": 0}) or {}
        hotel_name = settings.get("hotel_name") or "our hotel"
        token = secrets.token_urlsafe(16)
        link = f"{os.environ.get('PUBLIC_WEBSITE_URL', '').rstrip('/')}/feedback/{token}"
        name = customer.get("name", "Guest")
        doc = {
            "id": str(uuid.uuid4()),
            "token": token,
            "customer_id": customer["id"],
            "guest_name": name,
            "guest_email": email,
            "guest_phone": phone,
            "room_number": customer.get("current_room", ""),
            "check_in_date": _date_str(customer.get("check_in_date")),
            "check_out_date": _date_str(customer.get("actual_checkout_date") or customer.get("check_out_date")),
            "status": "pending",
            "created_at": datetime.utcnow(),
            "email_sent": False,
            "sms_sent": False,
        }
        await db.feedback_requests.insert_one(doc)
        email_sent = sms_sent = False
        if email:
            body = (
                f"Dear {name},\n\nThank you for staying with us at {hotel_name}. "
                f"We would love to hear about your experience - it takes less than a minute:\n\n{link}\n\n"
                f"Warm regards,\n{hotel_name}"
            )
            email_sent = bool(await send_email(email, f"How was your stay at {hotel_name}?", body))
        if phone:
            sms_sent = bool(await send_sms(phone, f"Dear {name}, thank you for staying at {hotel_name}! Please rate your stay: {link}"))
        await db.feedback_requests.update_one({"id": doc["id"]}, {"$set": {"email_sent": email_sent, "sms_sent": sms_sent}})
    except Exception as e:
        print(f"Feedback request error (non-critical): {e}")

@api_router.get("/feedback")
async def list_feedback(
    status_filter: Optional[str] = Query(None, alias="status"),
    min_rating: Optional[int] = None,
    max_rating: Optional[int] = None,
    search: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: UserResponse = Depends(get_current_user)
):
    docs = await db.feedback_requests.find({}, {"_id": 0, "token": 0}).sort("created_at", -1).to_list(5000)
    responses = [d for d in docs if d.get("status") == "submitted"]

    def avg(key):
        vals = [d[key] for d in responses if isinstance(d.get(key), (int, float)) and d.get(key)]
        return round(sum(vals) / len(vals), 2) if vals else None

    stats = {
        "total_requests": len(docs),
        "total_responses": len(responses),
        "response_rate": round(len(responses) * 100 / len(docs), 1) if docs else 0,
        "avg_overall": avg("overall_rating"),
        "avg_cleanliness": avg("cleanliness_rating"),
        "avg_staff": avg("staff_rating"),
        "avg_food": avg("food_rating"),
        "avg_comfort": avg("comfort_rating"),
        "distribution": {str(i): sum(1 for d in responses if d.get("overall_rating") == i) for i in range(1, 6)},
    }

    items = docs
    if status_filter in ("pending", "submitted"):
        items = [d for d in items if d.get("status") == status_filter]
    if min_rating:
        items = [d for d in items if (d.get("overall_rating") or 0) >= min_rating]
    if max_rating:
        items = [d for d in items if d.get("overall_rating") and d["overall_rating"] <= max_rating]
    if search:
        s = search.lower()
        items = [d for d in items if s in (d.get("guest_name") or "").lower() or s in (d.get("room_number") or "").lower() or s in (d.get("comment") or "").lower()]
    if start_date:
        items = [d for d in items if (d.get("check_out_date") or "") >= start_date]
    if end_date:
        items = [d for d in items if (d.get("check_out_date") or "") <= end_date]
    for d in items:
        for k in ("created_at", "submitted_at"):
            if isinstance(d.get(k), datetime):
                d[k] = d[k].isoformat()
    return {"items": items, "stats": stats}

# ==================== CHECK-OUT RECEIPT ====================
async def build_receipt(customer: dict):
    settings = await db.settings.find_one({}, {"_id": 0}) or {}
    hotel = {k: settings.get(k, "") for k in ["hotel_name", "hotel_logo", "hotel_address", "hotel_phone", "hotel_contact", "hotel_email"]}
    hotel["currency"] = settings.get("currency") or "LKR"
    name = customer.get("name", "")
    room = customer.get("current_room", "")
    ci = _date_str(customer.get("check_in_date"))
    co = _date_str(customer.get("actual_checkout_date") or customer.get("check_out_date"))
    try:
        nights = max(1, (datetime.strptime(co, "%Y-%m-%d") - datetime.strptime(ci, "%Y-%m-%d")).days)
    except ValueError:
        nights = 1

    orders = []
    gname = name.strip().lower()
    async for o in db.restaurant_orders.find({"room_number": {"$in": [room, f"Room {room}"]}, "order_status": {"$ne": "Cancelled"}, "payment_status": {"$ne": "Cancelled"}}, {"_id": 0}):
        od = _date_str(o.get("order_date"))
        cname = (o.get("customer_name") or "").strip().lower()
        other_guest = cname and cname not in gname and gname not in cname
        if ci <= od <= co and not other_guest:
            orders.append({
                "order_number": o.get("order_number", ""),
                "date": od,
                "items": [{"name": i.get("menu_item_name", ""), "quantity": i.get("quantity", 0), "unit_price": i.get("unit_price", 0), "total": i.get("total_price", 0)} for i in o.get("items", [])],
                "total_amount": o.get("total_amount", 0),
            })

    payments = []
    async for s in db.daily_sales.find({"customer_name": name, "sale_type": "room_booking_advance"}, {"_id": 0}):
        d = _date_str(s.get("date"))
        if ci <= d <= co:
            payments.append({"date": d, "description": "Advance at check-in", "method": s.get("payment_method", ""), "amount": s.get("total_amount", 0)})
    async for i in db.incomes.find({"guest_name": name, "category": "Advance Payment"}, {"_id": 0}):
        d = _date_str(i.get("income_date"))
        if ci <= d <= co:
            payments.append({"date": d, "description": "Advance payment", "method": i.get("payment_method", ""), "amount": i.get("amount", 0)})
    payments.sort(key=lambda p: p["date"])

    final_sale = await db.daily_sales.find_one(
        {"customer_name": name, "room_number": room, "sale_type": {"$exists": False}}, {"_id": 0}, sort=[("date", -1)]
    )
    room_charges = float(customer.get("room_charges") or 0)
    restaurant = float(customer.get("restaurant_charges") or 0)
    additional = float(customer.get("additional_charges") or 0)
    discount = float(customer.get("discount_amount") or 0)
    taxes = float(customer.get("taxes") or 0)
    advance = float(customer.get("advance_amount") or 0)
    grand_total = room_charges + restaurant + additional - discount + taxes
    booking = await db.bookings.find_one({"guest_name": name, "room_number": room}, {"_id": 0, "booking_channel_name": 1}, sort=[("created_at", -1)])
    return {
        "receipt_number": f"RCPT-{customer['id'][:8].upper()}",
        "issued_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "hotel": hotel,
        "guest": {"name": name, "email": customer.get("email", ""), "phone": customer.get("phone", "")},
        "stay": {
            "room_number": room, "check_in_date": ci, "check_out_date": co, "nights": nights,
            "rate_per_night": round(room_charges / nights, 2), "channel": (booking or {}).get("booking_channel_name") or "Direct",
            "is_checked_out": bool(customer.get("is_checked_out")),
        },
        "restaurant_orders": orders,
        "payments": payments,
        "totals": {
            "room_charges": room_charges, "restaurant_charges": restaurant, "additional_charges": additional,
            "discount_amount": discount, "taxes": taxes, "tax_breakdown": customer.get("tax_breakdown") or [],
            "grand_total": grand_total, "advance_paid": advance, "balance_settled": grand_total - advance,
            "settlement_method": (final_sale or {}).get("payment_method", ""),
        },
    }

@api_router.get("/receipts/customer/{customer_id}")
async def get_customer_receipt(customer_id: str, current_user: UserResponse = Depends(get_current_user)):
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return await build_receipt(customer)

@api_router.get("/receipts/booking/{booking_id}")
async def get_booking_receipt(booking_id: str, current_user: UserResponse = Depends(get_current_user)):
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    candidates = await db.customers.find({"name": booking.get("guest_name"), "current_room": booking.get("room_number")}, {"_id": 0}).to_list(100)
    if not candidates:
        raise HTTPException(status_code=404, detail="No stay record found for this booking (guest was never checked in)")
    bci = _date_str(booking.get("check_in_date"))
    customer = next((c for c in candidates if _date_str(c.get("check_in_date")) == bci), None) or max(candidates, key=lambda c: _date_str(c.get("check_in_date")))
    return await build_receipt(customer)

# ==================== SEO SETTINGS (CRM) ====================
import seo_routes

@api_router.get("/seo/settings")
async def get_seo_settings(current_user: UserResponse = Depends(get_current_active_admin)):
    return await seo_routes.load_seo()

@api_router.put("/seo/settings")
async def update_seo_settings(payload: dict, current_user: UserResponse = Depends(get_current_active_admin)):
    return await seo_routes.save_seo(payload, current_user.username)

@api_router.post("/seo/upload-image")
async def upload_seo_image(file: UploadFile = File(...), current_user: UserResponse = Depends(get_current_active_admin)):
    return {"url": seo_routes.save_upload(await file.read(), file.filename)}

# Test route
@api_router.get("/")
async def root():
    return {"message": "Hotel Management API"}

# Include the router in the main app
app.include_router(api_router)

# Include public website routes
from public_routes import public_router
app.include_router(public_router, prefix="/api")
app.include_router(seo_routes.seo_public_router, prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()