// require('dotenv').config();

// const path = require('path');
// const express = require('express');
// const cors = require('cors');
// const bodyParser = require('body-parser');
// const { MongoClient, ServerApiVersion } = require('mongodb');

// const app = express();
// const PORT = process.env.PORT || 3000;

// // Middleware
// app.use(cors({
//   origin: ['https://surveyform-kxkk.onrender.com', 'https://surveyform-1.onrender.com', 'http://localhost:3000'],
//   credentials: true
// }));
// app.use(bodyParser.json());

// app.use(express.static(path.join(__dirname, 'public')));

// // Serve auth.js file
// app.get('/auth.js', (req, res) => {
//   res.sendFile(path.join(__dirname, 'auth.js'));
// });

// // Health check endpoint
// app.get('/health', (req, res) => {
//   res.status(200).json({ 
//     status: 'OK', 
//     timestamp: new Date().toISOString(),
//     uptime: process.uptime()
//   });
// });

// // Serve home page
// app.get('/', (req, res) => {
//   res.sendFile(path.join(__dirname, 'public', 'home.html'));
// });

// app.get('/home', (req, res) => {
//   res.sendFile(path.join(__dirname, 'public', 'home.html'));
// });


// // MongoDB URI
// const uri = process.env.MONGO_URI;

// const client = new MongoClient(uri, { serverApi: ServerApiVersion.v1 });

// let userCollection;
// let questionCollection;

// // Simple in-memory cache
// const cache = {
//   questions: null,
//   lastQuestionsUpdate: null,
//   cacheTimeout: 5 * 60 * 1000, // 5 minutes
// };

// // Kết nối đến MongoDB
// client.connect()
//   .then(() => {
//     const db = client.db("myAppDB");
//     userCollection = db.collection("User");
//     questionCollection = db.collection("Question");
//     responseCollection = db.collection("Response");
//     console.log("✅ Connected to MongoDB");
//   })
//   .catch(err => {
//     console.error("❌ MongoDB connection error:", err);
//     process.exit(1); // Exit if can't connect to MongoDB
//   });

// // Serve login page
// app.get('/login', (req, res) => {
//   res.sendFile(path.join(__dirname, 'public', 'login.html'));
// });

// // API đăng nhập
// app.post('/login', async (req, res) => {
//   const { username, password } = req.body;

//   try {
//     const user = await userCollection.findOne({ username, password });

//     if (user) {
//       res.status(200).json({ message: "Login successful", user });
//     } else {
//       res.status(401).json({ message: "Invalid credentials" });
//     }
//   } catch (err) {
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// });

// // API lấy danh sách câu hỏi (sau đăng nhập) với pagination
// app.get('/questions', async (req, res) => {
//   try {
//     // Lấy parameters từ query
//     const { userId, page = 1, limit = 9, status } = req.query;
//     const pageNum = parseInt(page);
//     const limitNum = parseInt(limit);
//     const skip = (pageNum - 1) * limitNum;
    
//     console.log(`Fetching questions - page: ${pageNum}, limit: ${limitNum}, userId: ${userId}, status: ${status}`);
//     console.log('Collections available:', { userCollection: !!userCollection, questionCollection: !!questionCollection, responseCollection: !!responseCollection });
    
//     // Tối ưu: Lấy responses trước để có thể filter ở database level
//     let userResponses = [];
//     let answeredQuestions = new Map();
    
//     if (userId) {
//       const { ObjectId } = require('mongodb');
      
//       let userQueryId = userId;
//       try {
//         if (ObjectId.isValid(userId)) {
//           userQueryId = new ObjectId(userId);
//         }
//       } catch (e) {
//         console.log('UserId is not a valid ObjectId, using as string');
//       }
      
//       // Lấy responses với projection tối ưu
//       userResponses = await responseCollection.find({ 
//         userId: userQueryId,
//         isDelete: false 
//       }, {
//         projection: {
//           _id: 1,
//           questionId: 1,
//           ratings: 1
//         }
//       }).toArray();
      
//       // Tạo map để dễ dàng kiểm tra câu hỏi đã được trả lời
//       userResponses.forEach(response => {
//         answeredQuestions.set(response.questionId.toString(), response);
//       });
//     }
    
//     // Nếu status = 'all', lấy trực tiếp với pagination từ database
//     if (status === 'all') {
//       const allQuestions = await questionCollection.find({ isDelete: false }, {
//         projection: {
//           _id: 1,
//           prompt: 1,
//           imageInput: 1,
//           outputs: 1,
//           stt_doc: 1,
//           createdAt: 1
//         }
//       })
//         .sort({ stt_doc: 1 })
//         .skip(skip)
//         .limit(limitNum)
//         .toArray();
      
//       const totalQuestions = await questionCollection.countDocuments({ isDelete: false });
      
//       // Thêm status cho từng question
//       const questionsWithStatus = allQuestions.map((question, index) => {
//         const response = answeredQuestions.get(question._id.toString());
//         let hasAnswered = false;
//         let isComplete = false;
        
//         if (response && response.ratings) {
//           const questionOutputCount = question.outputs ? question.outputs.length : 0;
//           const responseRatingCount = Object.keys(response.ratings).length;
//           hasAnswered = true;
//           isComplete = questionOutputCount > 0 && responseRatingCount > 0 && questionOutputCount === responseRatingCount;
//         }
        
//         return {
//           ...question,
//           questionNumber: question.stt_doc || (skip + index + 1),
//           hasAnswered: hasAnswered,
//           isComplete: isComplete,
//           responseId: response?._id
//         };
//       });
      
//       console.log(`Found ${allQuestions.length} questions for page ${pageNum}`);
      
//       res.status(200).json({ 
//         questions: questionsWithStatus,
//         pagination: {
//           currentPage: pageNum,
//           totalPages: Math.ceil(totalQuestions / limitNum),
//           totalQuestions: totalQuestions,
//           hasNextPage: pageNum < Math.ceil(totalQuestions / limitNum),
//           hasPrevPage: pageNum > 1
//         },
//         userResponses: userResponses
//       });
//       return;
//     }
    
//     // Cho các status khác, cần lấy tất cả để filter
//     // Kiểm tra cache trước
//     let allQuestions;
//     const now = Date.now();
    
//     if (cache.questions && cache.lastQuestionsUpdate && 
//         (now - cache.lastQuestionsUpdate) < cache.cacheTimeout) {
//       console.log('Using cached questions');
//       allQuestions = cache.questions;
//     } else {
//       console.log('Fetching fresh questions from database');
//       allQuestions = await questionCollection.find({ isDelete: false }, {
//         projection: {
//           _id: 1,
//           prompt: 1,
//           imageInput: 1,
//           outputs: 1,
//           stt_doc: 1,
//           createdAt: 1
//         }
//       })
//         .sort({ stt_doc: 1 })
//         .toArray();
      
//       // Update cache
//       cache.questions = allQuestions;
//       cache.lastQuestionsUpdate = now;
//     }
    
//     console.log(`Found ${allQuestions.length} total questions`);
    
//     // Thêm thông tin trạng thái trả lời và số thứ tự vào mỗi câu hỏi
//     const questionsWithStatus = allQuestions.map((question, index) => {
//       const response = answeredQuestions.get(question._id.toString());
//       let hasAnswered = false;
//       let isComplete = false;
      
//       if (response && response.ratings) {
//         // Kiểm tra xem số lượng output images có khớp với số lượng ratings không
//         const questionOutputCount = question.outputs ? question.outputs.length : 0;
//         const responseRatingCount = Object.keys(response.ratings).length;
//         hasAnswered = true; // Có response
//         isComplete = questionOutputCount > 0 && responseRatingCount > 0 && questionOutputCount === responseRatingCount;
//       }
      
//       return {
//         ...question,
//         questionNumber: question.stt_doc || (index + 1), // Sử dụng stt_doc nếu có, fallback về index
//         hasAnswered: hasAnswered,
//         isComplete: isComplete,
//         responseId: response?._id
//       };
//     });
    
//     // Lọc theo status
//     let filteredQuestions = questionsWithStatus;
//     if (status === 'done') {
//       filteredQuestions = questionsWithStatus.filter(q => q.isComplete === true);
//     } else if (status === 'pending') {
//       filteredQuestions = questionsWithStatus.filter(q => q.hasAnswered === false);
//     } else if (status === 'in_progress') {
//       filteredQuestions = questionsWithStatus.filter(q => q.hasAnswered === true && q.isComplete === false);
//     }
    
//     // Sắp xếp: câu chưa trả lời lên trước, câu đã trả lời xuống sau
//     filteredQuestions.sort((a, b) => {
//       if (a.hasAnswered === b.hasAnswered) {
//         return a.questionNumber - b.questionNumber; // Giữ thứ tự theo số thứ tự
//       }
//       return a.hasAnswered ? 1 : -1; // Chưa trả lời lên trước
//     });
    
//     // Áp dụng phân trang cho filtered questions
//     const totalFilteredQuestions = filteredQuestions.length;
//     const totalPages = Math.ceil(totalFilteredQuestions / limitNum);
//     const startIndex = (pageNum - 1) * limitNum;
//     const endIndex = startIndex + limitNum;
//     const paginatedQuestions = filteredQuestions.slice(startIndex, endIndex);
    
//     console.log(`Filtered to ${totalFilteredQuestions} questions, showing ${paginatedQuestions.length} on page ${pageNum}`);
    
//     res.status(200).json({ 
//       questions: paginatedQuestions,
//       pagination: {
//         currentPage: pageNum,
//         totalPages: totalPages,
//         totalQuestions: totalFilteredQuestions,
//         hasNextPage: pageNum < totalPages,
//         hasPrevPage: pageNum > 1
//       },
//       userResponses: userResponses
//     });
//   } catch (err) {
//     res.status(500).json({ message: "Error fetching questions", error: err.message });
//   }
// });

// // API debug - lấy thông tin user
// app.get('/debug-user/:identifier', async (req, res) => {
//   const { identifier } = req.params;
  
//   try {
//     console.log('Debug user request for:', identifier);
//     console.log('Collections available:', { userCollection: !!userCollection, questionCollection: !!questionCollection, responseCollection: !!responseCollection });
    
//     const { ObjectId } = require('mongodb');
//     let user = null;
    
//     // Try to find by ObjectId first
//     if (ObjectId.isValid(identifier)) {
//       user = await userCollection.findOne({ _id: new ObjectId(identifier) });
//     }
    
//     // If not found, try by username
//     if (!user) {
//       user = await userCollection.findOne({ username: identifier });
//     }
    
//     if (user) {
//       res.status(200).json({ 
//         message: "User found", 
//         user: {
//           _id: user._id,
//           username: user.username,
//           name: user.name,
//           experience: user.experience,
//           qualification: user.qualification
//         }
//       });
//     } else {
//       res.status(404).json({ message: "User not found", identifier });
//     }
//   } catch (err) {
//     console.error("Error finding user:", err);
//     res.status(500).json({ message: "Error finding user", error: err.message });
//   }
// });

// // API cập nhật thông tin profile của user
// app.post('/update-profile', async (req, res) => {
//   const { userId, experience, qualification } = req.body;

//   try {
//     // Validate input
//     if (!userId || !experience || !qualification) {
//       return res.status(400).json({ 
//         message: "Missing required fields: userId, experience, qualification" 
//       });
//     }

//     console.log('Updating profile for userId:', userId);
//     console.log('Experience:', experience);
//     console.log('Qualification:', qualification);

//     // Convert string userId to ObjectId if needed
//     const { ObjectId } = require('mongodb');
//     let queryId = userId;
    
//     try {
//       // Try to convert to ObjectId if it's a valid ObjectId string
//       if (ObjectId.isValid(userId)) {
//         queryId = new ObjectId(userId);
//       }
//     } catch (e) {
//       console.log('UserId is not a valid ObjectId, using as string');
//     }

//     // Update user profile in database
//     const result = await userCollection.updateOne(
//       { _id: queryId },
//       { 
//         $set: { 
//           experience: experience,
//           qualification: qualification,
//           updatedAt: new Date()
//         } 
//       }
//     );

//     console.log('Update result:', result);

//     if (result.matchedCount === 0) {
//       // Try to find user by username as fallback
//       const user = await userCollection.findOne({ username: userId });
//       if (user) {
//         console.log('Found user by username, updating...');
//         const result2 = await userCollection.updateOne(
//           { username: userId },
//           { 
//             $set: { 
//               experience: experience,
//               qualification: qualification,
//               updatedAt: new Date()
//             } 
//           }
//         );
        
//         if (result2.modifiedCount > 0) {
//           return res.status(200).json({ 
//             message: "Profile updated successfully",
//             updatedFields: { experience, qualification }
//           });
//         }
//       }
      
//       return res.status(404).json({ 
//         message: "User not found",
//         debug: { userId, queryId, matchedCount: result.matchedCount }
//       });
//     }

//     if (result.modifiedCount === 0) {
//       return res.status(200).json({ message: "No changes made to profile" });
//     }

//     res.status(200).json({ 
//       message: "Profile updated successfully",
//       updatedFields: { experience, qualification }
//     });

//   } catch (err) {
//     console.error("Error updating profile:", err);
//     res.status(500).json({ 
//       message: "Error updating profile", 
//       error: err.message 
//     });
//   }
// });

// // API lấy danh sách users cho filter
// app.get('/users-list', async (req, res) => {
//   try {
//     const users = await userCollection.find({}, { 
//       projection: { 
//         _id: 1, 
//         name: 1, 
//         username: 1 
//       } 
//     }).toArray();
    
//     res.status(200).json({ users });
//   } catch (err) {
//     console.error("Error fetching users list:", err);
//     res.status(500).json({ 
//       message: "Error fetching users list", 
//       error: err.message 
//     });
//   }
// });

// // API lấy danh sách questions cho filter
// app.get('/questions-list', async (req, res) => {
//   try {
//     const questions = await questionCollection.find({ isDelete: false }, { 
//       projection: { 
//         _id: 1, 
//         prompt: 1,
//         stt_doc: 1,
//         createdAt: 1
//       } 
//     }).sort({ stt_doc: 1 }).toArray();
    
//     res.status(200).json({ questions });
//   } catch (err) {
//     console.error("Error fetching questions list:", err);
//     res.status(500).json({ 
//       message: "Error fetching questions list", 
//       error: err.message 
//     });
//   }
// });

// // API lấy tất cả responses với phân trang và filter
// app.get('/all-responses', async (req, res) => {
//   try {
//     const { page = 1, limit = 10, userId, questionId } = req.query;
//     const pageNum = parseInt(page);
//     const limitNum = parseInt(limit);
//     const skip = (pageNum - 1) * limitNum;

//     console.log('Fetching responses with params:', { page: pageNum, limit: limitNum, skip, userId, questionId });

//     const responseCollection = client.db("myAppDB").collection("Response");
    
//     // Tạo filter query
//     let filterQuery = { isDelete: false };
    
//     if (userId && userId !== 'all') {
//       const { ObjectId } = require('mongodb');
//       try {
//         if (ObjectId.isValid(userId)) {
//           filterQuery.userId = new ObjectId(userId);
//         } else {
//           filterQuery.userId = userId;
//         }
//       } catch (e) {
//         filterQuery.userId = userId;
//       }
//     }
    
//     if (questionId && questionId !== 'all') {
//       const { ObjectId } = require('mongodb');
//       try {
//         if (ObjectId.isValid(questionId)) {
//           filterQuery.questionId = new ObjectId(questionId);
//         } else {
//           filterQuery.questionId = questionId;
//         }
//       } catch (e) {
//         filterQuery.questionId = questionId;
//       }
//     }
    
//     // Lấy tổng số responses với filter
//     const totalResponses = await responseCollection.countDocuments(filterQuery);
//     console.log('Total responses found with filter:', totalResponses);
    
//     // Tìm số lượng output tối đa trong tất cả responses
//     const maxOutputsResult = await responseCollection.aggregate([
//       { $match: filterQuery },
//       {
//         $addFields: {
//           outputCount: { $size: { $objectToArray: "$ratings" } }
//         }
//       },
//       {
//         $group: {
//           _id: null,
//           maxOutputs: { $max: "$outputCount" }
//         }
//       }
//     ]).toArray();
    
//     const maxOutputs = maxOutputsResult.length > 0 ? maxOutputsResult[0].maxOutputs : 0;
    
//     // Lấy responses với phân trang, join với user và question
//     const responses = await responseCollection.aggregate([
//       { $match: filterQuery },
//       { $sort: { createdAt: -1 } }, // Mới nhất trước
//       { $skip: skip },
//       { $limit: limitNum },
//       {
//         $lookup: {
//           from: "User",
//           localField: "userId",
//           foreignField: "_id",
//           as: "user"
//         }
//       },
//       {
//         $lookup: {
//           from: "Question",
//           localField: "questionId",
//           foreignField: "_id",
//           as: "question"
//         }
//       },
//       {
//         $addFields: {
//           userName: { $arrayElemAt: ["$user.name", 0] },
//           userUsername: { $arrayElemAt: ["$user.username", 0] },
//           questionPrompt: { $arrayElemAt: ["$question.prompt", 0] }
//         }
//       },
//       {
//         $project: {
//           user: 0,
//           question: 0
//         }
//       }
//     ]).toArray();

//     res.status(200).json({
//       responses,
//       maxOutputs,
//       pagination: {
//         currentPage: pageNum,
//         totalPages: Math.ceil(totalResponses / limitNum),
//         totalResponses,
//         hasNextPage: pageNum < Math.ceil(totalResponses / limitNum),
//         hasPrevPage: pageNum > 1
//       }
//     });

//   } catch (err) {
//     console.error("Error fetching responses:", err);
//     res.status(500).json({ 
//       message: "Error fetching responses", 
//       error: err.message 
//     });
//   }
// });

// // API xóa response (soft delete)
// app.post('/delete-response', async (req, res) => {
//   const { responseId } = req.body;

//   try {
//     if (!responseId) {
//       return res.status(400).json({ 
//         message: "Missing required field: responseId" 
//       });
//     }

//     const responseCollection = client.db("myAppDB").collection("Response");
//     const { ObjectId } = require('mongodb');
    
//     let queryId = responseId;
//     try {
//       if (ObjectId.isValid(responseId)) {
//         queryId = new ObjectId(responseId);
//       }
//     } catch (e) {
//       console.log('ResponseId is not a valid ObjectId, using as string');
//     }

//     const result = await responseCollection.updateOne(
//       { _id: queryId },
//       { 
//         $set: { 
//           isDelete: true,
//           updatedAt: new Date()
//         } 
//       }
//     );

//     if (result.matchedCount === 0) {
//       return res.status(404).json({ message: "Response not found" });
//     }

//     res.status(200).json({ 
//       message: "Response deleted successfully"
//     });

//   } catch (err) {
//     console.error("Error deleting response:", err);
//     res.status(500).json({ 
//       message: "Error deleting response", 
//       error: err.message 
//     });
//   }
// });

// // API lấy tất cả questions cho admin
// app.get('/all-questions', async (req, res) => {
//   try {
//     const questions = await questionCollection.find({}, { 
//       projection: { 
//         _id: 1, 
//         prompt: 1,
//         imageInput: 1,
//         outputs: 1,
//         stt_doc: 1,
//         createdAt: 1,
//         isDelete: 1
//       } 
//     }).sort({ stt_doc: 1 }).toArray();
    
//     res.status(200).json({ questions });
//   } catch (err) {
//     console.error("Error fetching all questions:", err);
//     res.status(500).json({ 
//       message: "Error fetching all questions", 
//       error: err.message 
//     });
//   }
// });

// // API xóa question (soft delete)
// app.post('/delete-question', async (req, res) => {
//   const { questionId } = req.body;

//   try {
//     if (!questionId) {
//       return res.status(400).json({ 
//         message: "Missing required field: questionId" 
//       });
//     }

//     const { ObjectId } = require('mongodb');
    
//     let queryId = questionId;
//     try {
//       if (ObjectId.isValid(questionId)) {
//         queryId = new ObjectId(questionId);
//       }
//     } catch (e) {
//       console.log('QuestionId is not a valid ObjectId, using as string');
//     }

//     const result = await questionCollection.updateOne(
//       { _id: queryId },
//       { 
//         $set: { 
//           isDelete: true,
//           updatedAt: new Date()
//         } 
//       }
//     );

//     if (result.matchedCount === 0) {
//       return res.status(404).json({ message: "Question not found" });
//     }

//     res.status(200).json({ 
//       message: "Question deleted successfully"
//     });

//   } catch (err) {
//     console.error("Error deleting question:", err);
//     res.status(500).json({ 
//       message: "Error deleting question", 
//       error: err.message 
//     });
//   }
// });

// // API thêm question mới
// app.post('/add-question', async (req, res) => {
//   const { prompt, imageInput, outputs } = req.body;

//   try {
//     // Validate input
//     if (!prompt || !imageInput || !outputs || !Array.isArray(outputs)) {
//       return res.status(400).json({ 
//         message: "Missing required fields: prompt, imageInput, outputs (array)" 
//       });
//     }

//     console.log('Adding new question:', { prompt, imageInput, outputs });

//     // Lấy số thứ tự tiếp theo cho stt_doc
//     const maxSttDoc = await questionCollection.findOne(
//       { isDelete: false },
//       { sort: { stt_doc: -1 } }
//     );
//     const nextSttDoc = maxSttDoc ? (maxSttDoc.stt_doc || 0) + 1 : 1;

//     // Create question document
//     const question = {
//       prompt: prompt,
//       imageInput: imageInput,
//       outputs: outputs,
//       stt_doc: nextSttDoc,
//       isDelete: false,
//       createdAt: new Date(),
//       updatedAt: new Date()
//     };

//     // Save to database
//     const result = await questionCollection.insertOne(question);

//     console.log('Question saved with ID:', result.insertedId);

//     res.status(200).json({ 
//       message: "Question added successfully",
//       questionId: result.insertedId
//     });

//   } catch (err) {
//     console.error("Error adding question:", err);
//     res.status(500).json({ 
//       message: "Error adding question", 
//       error: err.message 
//     });
//   }
// });

// // API lưu evaluation
// app.post('/save-evaluation', async (req, res) => {
//   const { userId, questionId, questionNumber, ratings, comments } = req.body;

//   try {
//     // Validate input
//     if (!userId || !questionId || !questionNumber || !ratings) {
//       return res.status(400).json({ 
//         message: "Missing required fields: userId, questionId, questionNumber, ratings" 
//       });
//     }

//     console.log('Saving evaluation:', {
//       userId,
//       questionId,
//       questionNumber,
//       ratings,
//       comments: comments || 'No comments'
//     });

//     // Convert string IDs to ObjectId if needed
//     const { ObjectId } = require('mongodb');
//     let userQueryId = userId;
//     let questionQueryId = questionId;
    
//     try {
//       if (ObjectId.isValid(userId)) {
//         userQueryId = new ObjectId(userId);
//       }
//       if (ObjectId.isValid(questionId)) {
//         questionQueryId = new ObjectId(questionId);
//       }
//     } catch (e) {
//       console.log('Some IDs are not valid ObjectIds, using as strings');
//     }

//     // Check if response already exists for this user and question
//     const responseCollection = client.db("myAppDB").collection("Response");
//     const existingResponse = await responseCollection.findOne({
//       userId: userQueryId,
//       questionId: questionQueryId,
//       isDelete: false
//     });

//     if (existingResponse) {
//       // Update existing response
//       const updateData = {
//         questionNumber: questionNumber,
//         ratings: ratings,
//         comments: comments || '',
//         updatedAt: new Date()
//       };

//       const result = await responseCollection.updateOne(
//         { _id: existingResponse._id },
//         { $set: updateData }
//       );

//       console.log('Response updated for ID:', existingResponse._id);

//       res.status(200).json({ 
//         message: "Response updated successfully",
//         responseId: existingResponse._id,
//         isUpdate: true
//       });
//     } else {
//       // Create new evaluation document
//       const evaluation = {
//         userId: userQueryId,
//         questionId: questionQueryId,
//         questionNumber: questionNumber,
//         ratings: ratings,
//         comments: comments || '', // Make comments optional, default to empty string
//         isDelete: false,
//         createdAt: new Date(),
//         updatedAt: new Date()
//       };

//       // Save to database in Response collection
//       const result = await responseCollection.insertOne(evaluation);

//       console.log('Response saved with ID:', result.insertedId);

//       res.status(200).json({ 
//         message: "Response saved successfully",
//         responseId: result.insertedId,
//         isUpdate: false
//       });
//     }

//   } catch (err) {
//     console.error("Error saving evaluation:", err);
//     res.status(500).json({ 
//       message: "Error saving evaluation", 
//       error: err.message 
//     });
//   }
// });

// // API lấy response của user cho một question cụ thể
// app.get('/get-response', async (req, res) => {
//   const { userId, questionId } = req.query;

//   try {
//     // Validate input
//     if (!userId || !questionId) {
//       return res.status(400).json({ 
//         message: "Missing required fields: userId, questionId" 
//       });
//     }

//     console.log('Getting response for userId:', userId, 'questionId:', questionId);

//     // Convert string IDs to ObjectId if needed
//     const { ObjectId } = require('mongodb');
//     let userQueryId = userId;
//     let questionQueryId = questionId;
    
//     try {
//       if (ObjectId.isValid(userId)) {
//         userQueryId = new ObjectId(userId);
//       }
//       if (ObjectId.isValid(questionId)) {
//         questionQueryId = new ObjectId(questionId);
//       }
//     } catch (e) {
//       console.log('Some IDs are not valid ObjectIds, using as strings');
//     }

//     // Find existing response
//     const responseCollection = client.db("myAppDB").collection("Response");
//     const existingResponse = await responseCollection.findOne({
//       userId: userQueryId,
//       questionId: questionQueryId,
//       isDelete: false
//     });

//     if (existingResponse) {
//       console.log('Found existing response:', existingResponse._id);
//       res.status(200).json({ 
//         message: "Response found",
//         response: existingResponse
//       });
//     } else {
//       console.log('No existing response found');
//       res.status(404).json({ 
//         message: "No response found for this user and question"
//       });
//     }

//   } catch (err) {
//     console.error("Error getting response:", err);
//     res.status(500).json({ 
//       message: "Error getting response", 
//       error: err.message 
//     });
//   }
// });

// // API lấy tất cả users
// app.get('/all-users', async (req, res) => {
//   try {
//     const users = await userCollection.find({}).toArray();
//     const responseCollection = client.db("myAppDB").collection("Response");
//     const questionCollection = client.db("myAppDB").collection("Question");
    
//     // Lấy tổng số câu hỏi có isDelete = false
//     const totalQuestions = await questionCollection.countDocuments({ isDelete: false });
    
//     // Tính số câu hỏi đã trả lời cho mỗi user
//     const usersWithResponseCount = await Promise.all(users.map(async (user) => {
//       const { ObjectId } = require('mongodb');
      
//       let userQueryId = user._id;
//       try {
//         if (typeof user._id === 'string' && ObjectId.isValid(user._id)) {
//           userQueryId = new ObjectId(user._id);
//         }
//       } catch (e) {
//         console.log('UserId is not a valid ObjectId, using as string');
//       }
      
//       // Đếm số responses của user này cho các câu hỏi có isDelete = false
//       const answeredQuestionsCount = await responseCollection.countDocuments({
//         userId: userQueryId,
//         isDelete: false
//       });
      
//       return {
//         ...user,
//         answeredQuestionsCount,
//         totalQuestions
//       };
//     }));
    
//     console.log(`Found ${users.length} users with response counts`);
    
//     res.status(200).json({ 
//       users: usersWithResponseCount
//     });
    
//   } catch (err) {
//     console.error("Error fetching users:", err);
//     res.status(500).json({ 
//       message: "Error fetching users", 
//       error: err.message 
//     });
//   }
// });

// // API kiểm tra username exists
// app.get('/check-username/:username', async (req, res) => {
//   try {
//     const { username } = req.params;
    
//     const existingUser = await userCollection.findOne({ username: username });
    
//     res.status(200).json({ 
//       exists: !!existingUser
//     });
    
//   } catch (err) {
//     console.error("Error checking username:", err);
//     res.status(500).json({ 
//       message: "Error checking username", 
//       error: err.message 
//     });
//   }
// });

// // API thêm user mới
// app.post('/add-user', async (req, res) => {
//   const { name, username, role, password } = req.body;

//   try {
//     // Validate input
//     if (!name || !username || !role || !password) {
//       return res.status(400).json({ 
//         message: "Missing required fields: name, username, role, password" 
//       });
//     }

//     console.log('Adding new user:', {
//       name,
//       username,
//       role,
//       password: '***' // Don't log password
//     });

//     // Check if username already exists
//     const existingUser = await userCollection.findOne({ username: username });
//     if (existingUser) {
//       return res.status(400).json({ 
//         message: "Username already exists" 
//       });
//     }

//     // Create user document
//     const user = {
//       name: name,
//       username: username,
//       role: role,
//       password: password,
//       qualification: '',
//       experience: '',
//       isDelete: false,
//       createdAt: new Date(),
//       updatedAt: new Date()
//     };

//     // Save to database
//     const result = await userCollection.insertOne(user);

//     console.log('User saved with ID:', result.insertedId);

//     res.status(200).json({ 
//       message: "User added successfully",
//       userId: result.insertedId,
//       username: username
//     });

//   } catch (err) {
//     console.error("Error adding user:", err);
//     res.status(500).json({ 
//       message: "Error adding user", 
//       error: err.message 
//     });
//   }
// });

// // API soft delete user
// app.post('/delete-user', async (req, res) => {
//   const { userId } = req.body;

//   try {
//     // Validate input
//     if (!userId) {
//       return res.status(400).json({ 
//         message: "Missing required field: userId" 
//       });
//     }

//     console.log('Deleting user:', userId);

//     // Convert string ID to ObjectId if needed
//     const { ObjectId } = require('mongodb');
//     let userQueryId = userId;
    
//     try {
//       if (ObjectId.isValid(userId)) {
//         userQueryId = new ObjectId(userId);
//       }
//     } catch (e) {
//       console.log('UserId is not a valid ObjectId, using as string');
//     }

//     // Update user to set isDelete = true
//     const result = await userCollection.updateOne(
//       { _id: userQueryId },
//       { 
//         $set: { 
//           isDelete: true,
//           updatedAt: new Date()
//         } 
//       }
//     );

//     if (result.matchedCount === 0) {
//       return res.status(404).json({ 
//         message: "User not found" 
//       });
//     }

//     console.log('User soft deleted successfully');

//     res.status(200).json({ 
//       message: "User deleted successfully"
//     });

//   } catch (err) {
//     console.error("Error deleting user:", err);
//     res.status(500).json({ 
//       message: "Error deleting user", 
//       error: err.message 
//     });
//   }
// });

// // API để clear cache (cho admin)
// app.post('/clear-cache', (req, res) => {
//   cache.questions = null;
//   cache.lastQuestionsUpdate = null;
//   console.log('Cache cleared');
//   res.status(200).json({ message: "Cache cleared successfully" });
// });

// app.listen(PORT, '0.0.0.0', () => {
//   console.log(`🚀 Server running on port ${PORT}`);
//   console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
// });



import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

// ------------------- DATABASE SETUP -------------------
const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("❌ Missing MONGODB_URI in .env");
  process.exit(1);
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db;
async function connectDB() {
  try {
    await client.connect();
    db = client.db("critiqueDB");
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}
connectDB();

// ------------------- BASIC CRUD APIs -------------------

// ✅ GET all users
app.get("/api/users", async (req, res) => {
  try {
    const users = await db.collection("users").find().toArray();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// ✅ POST new user
app.post("/api/users", async (req, res) => {
  try {
    const user = req.body;
    const result = await db.collection("users").insertOne(user);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to add user" });
  }
});

// ✅ GET all questions
app.get("/api/questions", async (req, res) => {
  try {
    const questions = await db.collection("questions").find().toArray();
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch questions" });
  }
});

// ✅ POST new question
app.post("/api/questions", async (req, res) => {
  try {
    const question = req.body;
    const result = await db.collection("questions").insertOne(question);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to add question" });
  }
});

// ✅ GET responses for a question
app.get("/api/questions/:id/responses", async (req, res) => {
  try {
    const responses = await db
      .collection("responses")
      .find({ questionId: req.params.id })
      .toArray();
    res.json(responses);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch responses" });
  }
});

// ✅ POST new response
app.post("/api/questions/:id/responses", async (req, res) => {
  try {
    const response = { ...req.body, questionId: req.params.id };
    const result = await db.collection("responses").insertOne(response);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to add response" });
  }
});

// ------------------- GEMINI AI POLISH ENDPOINT -------------------

app.post("/api/polish-critique", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: "Text is required" });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "Gemini API key not configured" });
    }

    const GEMINI_MODEL = "gemini-2.0-flash";

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are a transcription cleaner.
Remove filler words and speech disfluencies (like "uh", "um", "ah", etc.).
Fix grammar and fluency, but keep the speaker's meaning, tone, and structure.
Do not summarize or change intent — only return the cleaned and polished text.

User text to clean: ${text}`,
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 1000,
            temperature: 0.3,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const polishedText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!polishedText) {
      return res.status(500).json({ error: "No response from Gemini API" });
    }

    res.json({ polishedText });
  } catch (error) {
    console.error("❌ Error calling Gemini API:", error);
    res.status(500).json({ error: "Failed to polish text" });
  }
});

// ------------------- HEALTH CHECK -------------------

app.get("/health", (req, res) => {
  res.json({ status: "OK", service: "Critique + Gemini API" });
});

// ------------------- START SERVER -------------------

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});
