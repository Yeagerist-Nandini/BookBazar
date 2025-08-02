
## create

- can't do select
const book = await db.book.create({
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


## find

### findUnique
const book = await db.book.findUnique({
        where: { id: bookId }  //unique field only
    })

### findFirst
const book = await db.book.findFirst({
        where: { id: bookId },
        select: {
            id: true,
            title: true,
            author: true
         }
    })

**findUnique, findFirst, findMany**

## update
- can't do select 

### update
user = await db.user.update({
    where: { id: userId },  //unique field only
    data : {
        name: "Hima",
        email: "fsdf"
    }
});


### updateMany
await db.user.updateMany({
    where: { role: 'guest'},  //unique field only
    data : {
        grp_name: "Hima",
        role: "member",
    }
});



## delete
- returns deleted book
- if **deleteMany** => returns count
const deletedBook = await db.book.delete({
        where: { id: bookId }, //only unique fields
    })



## relations

### many to many

model Book{
    id Int
    category Category[]
}

model Category{
    id Int
    book Book[]
}


### one to one
model User{
    id Int
    aadhar String

    aadhar User @relation(fields: [aadhar], references: [id], onDelete: Cascade)
}

model Aadhar{
    id Int
    userId String

    user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}


### many to one

model Book {
  id          Int      @id @default(autoincrement())
  title       String
  categoryId  Int
  
  category    Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)
}

model Category {
  id    Int    @id @default(autoincrement())
  name  String
  books Book[] // One category → many books
}