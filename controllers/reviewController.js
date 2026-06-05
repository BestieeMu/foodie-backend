const supabase = require('../utils/supabase');

const submitReview = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { 
      rating, 
      comment, 
      driverRating, 
      driverComment, 
      platformRating, 
      platformComment 
    } = req.body;
    const userId = req.user.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Restaurant rating must be between 1 and 5' });
    }

    // 1. Get the order and verify ownership + delivery status
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.user_id !== userId) {
      return res.status(403).json({ message: 'You can only review your own orders' });
    }

    if (order.status !== 'delivered') {
      return res.status(400).json({ message: 'You can only review delivered orders' });
    }

    // 2. Check if review already exists for this order
    const { data: existingReview } = await supabase
      .from('reviews')
      .select('id')
      .eq('order_id', orderId)
      .single();

    if (existingReview) {
      return res.status(409).json({ message: 'You have already reviewed this order' });
    }

    // 3. Create the review
    const reviewId = `rev_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const reviewData = {
      id: reviewId,
      restaurant_id: order.restaurant_id,
      user_id: userId,
      order_id: orderId,
      rating: parseInt(rating),
      comment: comment || null
    };

    // Add driver review details if applicable
    if (order.driver_id && driverRating !== undefined) {
      const parsedDriverRating = parseInt(driverRating);
      if (parsedDriverRating < 1 || parsedDriverRating > 5) {
        return res.status(400).json({ message: 'Driver rating must be between 1 and 5' });
      }
      reviewData.driver_id = order.driver_id;
      reviewData.driver_rating = parsedDriverRating;
      reviewData.driver_comment = driverComment || null;
    }

    // Add platform review details if applicable
    if (platformRating !== undefined) {
      const parsedPlatformRating = parseInt(platformRating);
      if (parsedPlatformRating < 1 || parsedPlatformRating > 5) {
        return res.status(400).json({ message: 'Platform rating must be between 1 and 5' });
      }
      reviewData.platform_rating = parsedPlatformRating;
      reviewData.platform_comment = platformComment || null;
    }

    const { data: review, error: reviewError } = await supabase
      .from('reviews')
      .insert(reviewData)
      .select()
      .single();

    if (reviewError) throw reviewError;

    // 4. Update the restaurant's average rating
    const { data: allReviews, error: avgError } = await supabase
      .from('reviews')
      .select('rating')
      .eq('restaurant_id', order.restaurant_id);

    if (!avgError && allReviews && allReviews.length > 0) {
      const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
      await supabase
        .from('restaurants')
        .update({ rating: parseFloat(avgRating.toFixed(1)) })
        .eq('id', order.restaurant_id);
    }

    res.status(201).json(review);
  } catch (error) {
    console.error('Submit review error:', error);
    next(error);
  }
};

const getRestaurantReviews = async (req, res, next) => {
  try {
    const { restaurantId } = req.params;

    const { data: reviews, error } = await supabase
      .from('reviews')
      .select('*, user:user_id(name), driver:driver_id(name)')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json(reviews || []);
  } catch (error) {
    next(error);
  }
};

const respondToReview = async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const { response } = req.body;
    const adminId = req.user.id;

    if (!response || response.trim() === '') {
      return res.status(400).json({ message: 'Response comment cannot be empty' });
    }

    // 1. Get the admin's restaurant to verify ownership
    const { data: userAdmin, error: userError } = await supabase
      .from('users')
      .select('restaurant_id')
      .eq('id', adminId)
      .single();

    if (userError || !userAdmin || !userAdmin.restaurant_id) {
      return res.status(403).json({ message: 'You are not authorized to respond to this review' });
    }

    // 2. Fetch review to verify it is for this restaurant
    const { data: review, error: reviewError } = await supabase
      .from('reviews')
      .select('*')
      .eq('id', reviewId)
      .single();

    if (reviewError || !review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    if (review.restaurant_id !== userAdmin.restaurant_id) {
      return res.status(403).json({ message: 'You can only respond to reviews left for your restaurant' });
    }

    // 3. Update review with response
    const { data: updatedReview, error: updateError } = await supabase
      .from('reviews')
      .update({
        restaurant_response: response,
        restaurant_responded_at: new Date().toISOString()
      })
      .eq('id', reviewId)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json(updatedReview);
  } catch (error) {
    console.error('Respond to review error:', error);
    next(error);
  }
};

const getSystemReviews = async (req, res, next) => {
  try {
    const { data: reviews, error } = await supabase
      .from('reviews')
      .select(`
        *,
        user:user_id(name),
        restaurant:restaurant_id(name),
        driver:driver_id(name)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(reviews || []);
  } catch (error) {
    console.error('Get system reviews error:', error);
    next(error);
  }
};

module.exports = {
  submitReview,
  getRestaurantReviews,
  respondToReview,
  getSystemReviews
};
