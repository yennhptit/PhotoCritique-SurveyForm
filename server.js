require('dotenv').config();


const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MongoDB URI
const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, { serverApi: ServerApiVersion.v1 });

let userCollection;
let questionCollection;

// Kết nối đến MongoDB
client.connect()
  .then(() => {
    const db = client.db("myAppDB");
    userCollection = db.collection("User");
    questionCollection = db.collection("Question");
    console.log("✅ Connected to MongoDB");
  })
  .catch(err => console.error("❌ MongoDB connection error:", err));

// API đăng nhập
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await userCollection.findOne({ username, password });

    if (user) {
      res.status(200).json({ message: "Login successful", user });
    } else {
      res.status(401).json({ message: "Invalid credentials" });
    }
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// API lấy danh sách câu hỏi (sau đăng nhập)
app.get('/questions', async (req, res) => {
  try {
    // Lấy userId từ query parameter
    const { userId } = req.query;
    
    // Chỉ lấy câu hỏi có isDelete: false, sắp xếp theo createdAt
    const questions = await questionCollection.find({ isDelete: false })
      .sort({ createdAt: 1 }) // Sắp xếp theo thời gian tạo, cũ nhất trước
      .toArray();
    
    // Nếu có userId, lấy responses của user đó
    let userResponses = [];
    if (userId) {
      const responseCollection = client.db("myAppDB").collection("Response");
      const { ObjectId } = require('mongodb');
      
      let userQueryId = userId;
      try {
        if (ObjectId.isValid(userId)) {
          userQueryId = new ObjectId(userId);
        }
      } catch (e) {
        console.log('UserId is not a valid ObjectId, using as string');
      }
      
      userResponses = await responseCollection.find({ 
        userId: userQueryId,
        isDelete: false 
      }).toArray();
    }
    
    // Tạo map để dễ dàng kiểm tra câu hỏi đã được trả lời
    const answeredQuestions = new Map();
    userResponses.forEach(response => {
      answeredQuestions.set(response.questionId.toString(), response);
    });
    
    // Thêm thông tin trạng thái trả lời và số thứ tự vào mỗi câu hỏi
    const questionsWithStatus = questions.map((question, index) => ({
      ...question,
      questionNumber: index + 1, // Số thứ tự theo thứ tự trên server
      hasAnswered: answeredQuestions.has(question._id.toString()),
      responseId: answeredQuestions.get(question._id.toString())?._id
    }));
    
    // Sắp xếp: câu chưa trả lời lên trước, câu đã trả lời xuống sau
    questionsWithStatus.sort((a, b) => {
      if (a.hasAnswered === b.hasAnswered) {
        return a.questionNumber - b.questionNumber; // Giữ thứ tự theo số thứ tự
      }
      return a.hasAnswered ? 1 : -1; // Chưa trả lời lên trước
    });
    
    res.status(200).json({ 
      questions: questionsWithStatus,
      userResponses: userResponses
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching questions", error: err.message });
  }
});

// API debug - lấy thông tin user
app.get('/debug-user/:identifier', async (req, res) => {
  const { identifier } = req.params;
  
  try {
    const { ObjectId } = require('mongodb');
    let user = null;
    
    // Try to find by ObjectId first
    if (ObjectId.isValid(identifier)) {
      user = await userCollection.findOne({ _id: new ObjectId(identifier) });
    }
    
    // If not found, try by username
    if (!user) {
      user = await userCollection.findOne({ username: identifier });
    }
    
    if (user) {
      res.status(200).json({ 
        message: "User found", 
        user: {
          _id: user._id,
          username: user.username,
          name: user.name,
          experience: user.experience,
          qualification: user.qualification
        }
      });
    } else {
      res.status(404).json({ message: "User not found", identifier });
    }
  } catch (err) {
    console.error("Error finding user:", err);
    res.status(500).json({ message: "Error finding user", error: err.message });
  }
});

// API cập nhật thông tin profile của user
app.post('/update-profile', async (req, res) => {
  const { userId, experience, qualification } = req.body;

  try {
    // Validate input
    if (!userId || !experience || !qualification) {
      return res.status(400).json({ 
        message: "Missing required fields: userId, experience, qualification" 
      });
    }

    console.log('Updating profile for userId:', userId);
    console.log('Experience:', experience);
    console.log('Qualification:', qualification);

    // Convert string userId to ObjectId if needed
    const { ObjectId } = require('mongodb');
    let queryId = userId;
    
    try {
      // Try to convert to ObjectId if it's a valid ObjectId string
      if (ObjectId.isValid(userId)) {
        queryId = new ObjectId(userId);
      }
    } catch (e) {
      console.log('UserId is not a valid ObjectId, using as string');
    }

    // Update user profile in database
    const result = await userCollection.updateOne(
      { _id: queryId },
      { 
        $set: { 
          experience: experience,
          qualification: qualification,
          updatedAt: new Date()
        } 
      }
    );

    console.log('Update result:', result);

    if (result.matchedCount === 0) {
      // Try to find user by username as fallback
      const user = await userCollection.findOne({ username: userId });
      if (user) {
        console.log('Found user by username, updating...');
        const result2 = await userCollection.updateOne(
          { username: userId },
          { 
            $set: { 
              experience: experience,
              qualification: qualification,
              updatedAt: new Date()
            } 
          }
        );
        
        if (result2.modifiedCount > 0) {
          return res.status(200).json({ 
            message: "Profile updated successfully",
            updatedFields: { experience, qualification }
          });
        }
      }
      
      return res.status(404).json({ 
        message: "User not found",
        debug: { userId, queryId, matchedCount: result.matchedCount }
      });
    }

    if (result.modifiedCount === 0) {
      return res.status(200).json({ message: "No changes made to profile" });
    }

    res.status(200).json({ 
      message: "Profile updated successfully",
      updatedFields: { experience, qualification }
    });

  } catch (err) {
    console.error("Error updating profile:", err);
    res.status(500).json({ 
      message: "Error updating profile", 
      error: err.message 
    });
  }
});

// API lấy danh sách users cho filter
app.get('/users-list', async (req, res) => {
  try {
    const users = await userCollection.find({}, { 
      projection: { 
        _id: 1, 
        name: 1, 
        username: 1 
      } 
    }).toArray();
    
    res.status(200).json({ users });
  } catch (err) {
    console.error("Error fetching users list:", err);
    res.status(500).json({ 
      message: "Error fetching users list", 
      error: err.message 
    });
  }
});

// API lấy danh sách questions cho filter
app.get('/questions-list', async (req, res) => {
  try {
    const questions = await questionCollection.find({ isDelete: false }, { 
      projection: { 
        _id: 1, 
        prompt: 1,
        createdAt: 1
      } 
    }).sort({ createdAt: 1 }).toArray();
    
    res.status(200).json({ questions });
  } catch (err) {
    console.error("Error fetching questions list:", err);
    res.status(500).json({ 
      message: "Error fetching questions list", 
      error: err.message 
    });
  }
});

// API lấy tất cả responses với phân trang và filter
app.get('/all-responses', async (req, res) => {
  try {
    const { page = 1, limit = 10, userId, questionId } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    console.log('Fetching responses with params:', { page: pageNum, limit: limitNum, skip, userId, questionId });

    const responseCollection = client.db("myAppDB").collection("Response");
    
    // Tạo filter query
    let filterQuery = { isDelete: false };
    
    if (userId && userId !== 'all') {
      const { ObjectId } = require('mongodb');
      try {
        if (ObjectId.isValid(userId)) {
          filterQuery.userId = new ObjectId(userId);
        } else {
          filterQuery.userId = userId;
        }
      } catch (e) {
        filterQuery.userId = userId;
      }
    }
    
    if (questionId && questionId !== 'all') {
      const { ObjectId } = require('mongodb');
      try {
        if (ObjectId.isValid(questionId)) {
          filterQuery.questionId = new ObjectId(questionId);
        } else {
          filterQuery.questionId = questionId;
        }
      } catch (e) {
        filterQuery.questionId = questionId;
      }
    }
    
    // Lấy tổng số responses với filter
    const totalResponses = await responseCollection.countDocuments(filterQuery);
    console.log('Total responses found with filter:', totalResponses);
    
    // Tìm số lượng output tối đa trong tất cả responses
    const maxOutputsResult = await responseCollection.aggregate([
      { $match: filterQuery },
      {
        $addFields: {
          outputCount: { $size: { $objectToArray: "$ratings" } }
        }
      },
      {
        $group: {
          _id: null,
          maxOutputs: { $max: "$outputCount" }
        }
      }
    ]).toArray();
    
    const maxOutputs = maxOutputsResult.length > 0 ? maxOutputsResult[0].maxOutputs : 0;
    
    // Lấy responses với phân trang, join với user và question
    const responses = await responseCollection.aggregate([
      { $match: filterQuery },
      { $sort: { createdAt: -1 } }, // Mới nhất trước
      { $skip: skip },
      { $limit: limitNum },
      {
        $lookup: {
          from: "User",
          localField: "userId",
          foreignField: "_id",
          as: "user"
        }
      },
      {
        $lookup: {
          from: "Question",
          localField: "questionId",
          foreignField: "_id",
          as: "question"
        }
      },
      {
        $addFields: {
          userName: { $arrayElemAt: ["$user.name", 0] },
          userUsername: { $arrayElemAt: ["$user.username", 0] },
          questionPrompt: { $arrayElemAt: ["$question.prompt", 0] }
        }
      },
      {
        $project: {
          user: 0,
          question: 0
        }
      }
    ]).toArray();

    res.status(200).json({
      responses,
      maxOutputs,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalResponses / limitNum),
        totalResponses,
        hasNextPage: pageNum < Math.ceil(totalResponses / limitNum),
        hasPrevPage: pageNum > 1
      }
    });

  } catch (err) {
    console.error("Error fetching responses:", err);
    res.status(500).json({ 
      message: "Error fetching responses", 
      error: err.message 
    });
  }
});

// API xóa response (soft delete)
app.post('/delete-response', async (req, res) => {
  const { responseId } = req.body;

  try {
    if (!responseId) {
      return res.status(400).json({ 
        message: "Missing required field: responseId" 
      });
    }

    const responseCollection = client.db("myAppDB").collection("Response");
    const { ObjectId } = require('mongodb');
    
    let queryId = responseId;
    try {
      if (ObjectId.isValid(responseId)) {
        queryId = new ObjectId(responseId);
      }
    } catch (e) {
      console.log('ResponseId is not a valid ObjectId, using as string');
    }

    const result = await responseCollection.updateOne(
      { _id: queryId },
      { 
        $set: { 
          isDelete: true,
          updatedAt: new Date()
        } 
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Response not found" });
    }

    res.status(200).json({ 
      message: "Response deleted successfully"
    });

  } catch (err) {
    console.error("Error deleting response:", err);
    res.status(500).json({ 
      message: "Error deleting response", 
      error: err.message 
    });
  }
});

// API lấy tất cả questions cho admin
app.get('/all-questions', async (req, res) => {
  try {
    const questions = await questionCollection.find({}, { 
      projection: { 
        _id: 1, 
        prompt: 1,
        imageInput: 1,
        outputs: 1,
        createdAt: 1,
        isDelete: 1
      } 
    }).sort({ createdAt: 1 }).toArray();
    
    res.status(200).json({ questions });
  } catch (err) {
    console.error("Error fetching all questions:", err);
    res.status(500).json({ 
      message: "Error fetching all questions", 
      error: err.message 
    });
  }
});

// API xóa question (soft delete)
app.post('/delete-question', async (req, res) => {
  const { questionId } = req.body;

  try {
    if (!questionId) {
      return res.status(400).json({ 
        message: "Missing required field: questionId" 
      });
    }

    const { ObjectId } = require('mongodb');
    
    let queryId = questionId;
    try {
      if (ObjectId.isValid(questionId)) {
        queryId = new ObjectId(questionId);
      }
    } catch (e) {
      console.log('QuestionId is not a valid ObjectId, using as string');
    }

    const result = await questionCollection.updateOne(
      { _id: queryId },
      { 
        $set: { 
          isDelete: true,
          updatedAt: new Date()
        } 
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Question not found" });
    }

    res.status(200).json({ 
      message: "Question deleted successfully"
    });

  } catch (err) {
    console.error("Error deleting question:", err);
    res.status(500).json({ 
      message: "Error deleting question", 
      error: err.message 
    });
  }
});

// API thêm question mới
app.post('/add-question', async (req, res) => {
  const { prompt, imageInput, outputs } = req.body;

  try {
    // Validate input
    if (!prompt || !imageInput || !outputs || !Array.isArray(outputs)) {
      return res.status(400).json({ 
        message: "Missing required fields: prompt, imageInput, outputs (array)" 
      });
    }

    console.log('Adding new question:', { prompt, imageInput, outputs });

    // Create question document
    const question = {
      prompt: prompt,
      imageInput: imageInput,
      outputs: outputs,
      isDelete: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Save to database
    const result = await questionCollection.insertOne(question);

    console.log('Question saved with ID:', result.insertedId);

    res.status(200).json({ 
      message: "Question added successfully",
      questionId: result.insertedId
    });

  } catch (err) {
    console.error("Error adding question:", err);
    res.status(500).json({ 
      message: "Error adding question", 
      error: err.message 
    });
  }
});

// API lưu evaluation
app.post('/save-evaluation', async (req, res) => {
  const { userId, questionId, questionNumber, ratings, comments } = req.body;

  try {
    // Validate input
    if (!userId || !questionId || !questionNumber || !ratings || !comments) {
      return res.status(400).json({ 
        message: "Missing required fields: userId, questionId, questionNumber, ratings, comments" 
      });
    }

    console.log('Saving evaluation:', {
      userId,
      questionId,
      questionNumber,
      ratings,
      comments
    });

    // Convert string IDs to ObjectId if needed
    const { ObjectId } = require('mongodb');
    let userQueryId = userId;
    let questionQueryId = questionId;
    
    try {
      if (ObjectId.isValid(userId)) {
        userQueryId = new ObjectId(userId);
      }
      if (ObjectId.isValid(questionId)) {
        questionQueryId = new ObjectId(questionId);
      }
    } catch (e) {
      console.log('Some IDs are not valid ObjectIds, using as strings');
    }

    // Create evaluation document
    const evaluation = {
      userId: userQueryId,
      questionId: questionQueryId,
      questionNumber: questionNumber,
      ratings: ratings,
      comments: comments,
      isDelete: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Save to database in Response collection
    const responseCollection = client.db("myAppDB").collection("Response");
    const result = await responseCollection.insertOne(evaluation);

    console.log('Response saved with ID:', result.insertedId);

    res.status(200).json({ 
      message: "Response saved successfully",
      responseId: result.insertedId
    });

  } catch (err) {
    console.error("Error saving evaluation:", err);
    res.status(500).json({ 
      message: "Error saving evaluation", 
      error: err.message 
    });
  }
});

// API lấy tất cả users
app.get('/all-users', async (req, res) => {
  try {
    const users = await userCollection.find({}).toArray();
    const responseCollection = client.db("myAppDB").collection("Response");
    const questionCollection = client.db("myAppDB").collection("Question");
    
    // Lấy tổng số câu hỏi có isDelete = false
    const totalQuestions = await questionCollection.countDocuments({ isDelete: false });
    
    // Tính số câu hỏi đã trả lời cho mỗi user
    const usersWithResponseCount = await Promise.all(users.map(async (user) => {
      const { ObjectId } = require('mongodb');
      
      let userQueryId = user._id;
      try {
        if (typeof user._id === 'string' && ObjectId.isValid(user._id)) {
          userQueryId = new ObjectId(user._id);
        }
      } catch (e) {
        console.log('UserId is not a valid ObjectId, using as string');
      }
      
      // Đếm số responses của user này cho các câu hỏi có isDelete = false
      const answeredQuestionsCount = await responseCollection.countDocuments({
        userId: userQueryId,
        isDelete: false
      });
      
      return {
        ...user,
        answeredQuestionsCount,
        totalQuestions
      };
    }));
    
    console.log(`Found ${users.length} users with response counts`);
    
    res.status(200).json({ 
      users: usersWithResponseCount
    });
    
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ 
      message: "Error fetching users", 
      error: err.message 
    });
  }
});

// API kiểm tra username exists
app.get('/check-username/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    const existingUser = await userCollection.findOne({ username: username });
    
    res.status(200).json({ 
      exists: !!existingUser
    });
    
  } catch (err) {
    console.error("Error checking username:", err);
    res.status(500).json({ 
      message: "Error checking username", 
      error: err.message 
    });
  }
});

// API thêm user mới
app.post('/add-user', async (req, res) => {
  const { name, username, role, password } = req.body;

  try {
    // Validate input
    if (!name || !username || !role || !password) {
      return res.status(400).json({ 
        message: "Missing required fields: name, username, role, password" 
      });
    }

    console.log('Adding new user:', {
      name,
      username,
      role,
      password: '***' // Don't log password
    });

    // Check if username already exists
    const existingUser = await userCollection.findOne({ username: username });
    if (existingUser) {
      return res.status(400).json({ 
        message: "Username already exists" 
      });
    }

    // Create user document
    const user = {
      name: name,
      username: username,
      role: role,
      password: password,
      qualification: '',
      experience: '',
      isDelete: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Save to database
    const result = await userCollection.insertOne(user);

    console.log('User saved with ID:', result.insertedId);

    res.status(200).json({ 
      message: "User added successfully",
      userId: result.insertedId,
      username: username
    });

  } catch (err) {
    console.error("Error adding user:", err);
    res.status(500).json({ 
      message: "Error adding user", 
      error: err.message 
    });
  }
});

// API soft delete user
app.post('/delete-user', async (req, res) => {
  const { userId } = req.body;

  try {
    // Validate input
    if (!userId) {
      return res.status(400).json({ 
        message: "Missing required field: userId" 
      });
    }

    console.log('Deleting user:', userId);

    // Convert string ID to ObjectId if needed
    const { ObjectId } = require('mongodb');
    let userQueryId = userId;
    
    try {
      if (ObjectId.isValid(userId)) {
        userQueryId = new ObjectId(userId);
      }
    } catch (e) {
      console.log('UserId is not a valid ObjectId, using as string');
    }

    // Update user to set isDelete = true
    const result = await userCollection.updateOne(
      { _id: userQueryId },
      { 
        $set: { 
          isDelete: true,
          updatedAt: new Date()
        } 
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ 
        message: "User not found" 
      });
    }

    console.log('User soft deleted successfully');

    res.status(200).json({ 
      message: "User deleted successfully"
    });

  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ 
      message: "Error deleting user", 
      error: err.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
